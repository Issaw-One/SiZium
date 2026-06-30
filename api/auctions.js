import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = {
  runtime: "nodejs"
};

function generateToken(userId) {
  const payload = { userId, exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const { method } = req;
  const path = req.url?.split('/api/auctions/')[1]?.split('?')[0] || '';

  try {
    // Get all active auctions
    if (method === 'GET' && path === '') {
      const { data: auctions, error } = await supabase
        .from('auctions')
        .select('*')
        .eq('status', 'active')
        .order('end_time', { ascending: true });

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch auctions' });
      }

      return res.json({ auctions: auctions || [] });
    }

    // Get single auction with bids
    if (method === 'GET' && path?.startsWith('id/')) {
      const auctionId = path.split('id/')[1];

      const { data: auction, error } = await supabase
        .from('auctions')
        .select('*')
        .eq('id', auctionId)
        .single();

      if (error || !auction) {
        return res.status(404).json({ error: 'Auction not found' });
      }

      // Get bids
      const { data: bids } = await supabase
        .from('bids')
        .select('*')
        .eq('auction_id', auctionId)
        .order('amount', { ascending: false })
        .limit(10);

      return res.json({ auction, bids: bids || [] });
    }

    // Create auction
    if (method === 'POST' && path === 'create') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { itemName, itemImage, description, startingBid, minIncrement, endTime } = req.body;

      if (!itemName || !startingBid || !endTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { data: auction, error } = await supabase
        .from('auctions')
        .insert({
          item_name: itemName,
          item_image: itemImage,
          description,
          starting_bid: startingBid,
          current_bid: startingBid,
          min_increment: minIncrement || 1,
          end_time: new Date(endTime).toISOString(),
          seller_id: payload.userId,
          status: 'active'
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create auction' });
      }

      return res.json({ success: true, auction });
    }

    // Place bid
    if (method === 'POST' && path === 'bid') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { auctionId, amount } = req.body;

      if (!auctionId || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get auction
      const { data: auction, error: auctionError } = await supabase
        .from('auctions')
        .select('*')
        .eq('id', auctionId)
        .single();

      if (auctionError || !auction) {
        return res.status(404).json({ error: 'Auction not found' });
      }

      if (auction.status !== 'active') {
        return res.status(400).json({ error: 'Auction is not active' });
      }

      if (new Date(auction.end_time) < new Date()) {
        return res.status(400).json({ error: 'Auction has ended' });
      }

      if (amount <= auction.current_bid) {
        return res.status(400).json({ error: 'Bid must be higher than current bid' });
      }

      const minBid = auction.current_bid + auction.min_increment;
      if (amount < minBid) {
        return res.status(400).json({ error: `Minimum bid is ${minBid}` });
      }

      // Create bid
      const { error: bidError } = await supabase
        .from('bids')
        .insert({
          auction_id: auctionId,
          user_id: payload.userId,
          amount
        });

      if (bidError) {
        return res.status(500).json({ error: 'Failed to place bid' });
      }

      // Update auction current bid
      const { error: updateError } = await supabase
        .from('auctions')
        .update({ current_bid: amount })
        .eq('id', auctionId);

      if (updateError) {
        console.error('Failed to update auction:', updateError);
      }

      return res.json({ success: true, newBid: amount });
    }

    // End auction
    if (method === 'POST' && path === 'end') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { auctionId } = req.body;

      if (!auctionId) {
        return res.status(400).json({ error: 'Auction ID required' });
      }

      // Get auction
      const { data: auction } = await supabase
        .from('auctions')
        .select('*')
        .eq('id', auctionId)
        .single();

      if (!auction) {
        return res.status(404).json({ error: 'Auction not found' });
      }

      // Get highest bid
      const { data: highestBid } = await supabase
        .from('bids')
        .select('*')
        .eq('auction_id', auctionId)
        .order('amount', { ascending: false })
        .limit(1)
        .single();

      // Update auction
      const { error } = await supabase
        .from('auctions')
        .update({
          status: 'ended',
          winner_id: highestBid?.user_id || null
        })
        .eq('id', auctionId);

      if (error) {
        return res.status(500).json({ error: 'Failed to end auction' });
      }

      return res.json({ success: true, winnerId: highestBid?.user_id });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Auctions API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
