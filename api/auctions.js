import { readJSON, writeJSON, generateId } from '../lib/storage.js';

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
      const auctions = await readJSON('auctions.json');
      const activeAuctions = auctions
        .filter(a => a.status === 'active')
        .sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

      return res.json({ auctions: activeAuctions });
    }

    // Get single auction with bids
    if (method === 'GET' && path?.startsWith('id/')) {
      const auctionId = path.split('id/')[1];

      const auctions = await readJSON('auctions.json');
      const auction = auctions.find(a => a.id === auctionId);

      if (!auction) {
        return res.status(404).json({ error: 'Auction not found' });
      }

      // Get bids
      const bids = await readJSON('bids.json');
      const auctionBids = bids
        .filter(b => b.auctionId === auctionId)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      return res.json({ auction, bids: auctionBids });
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

      const auction = {
        id: generateId(),
        itemName,
        itemImage,
        description,
        startingBid,
        currentBid: startingBid,
        minIncrement: minIncrement || 1,
        endTime: new Date(endTime).toISOString(),
        sellerId: payload.userId,
        winnerId: null,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      const auctions = await readJSON('auctions.json');
      auctions.push(auction);
      await writeJSON('auctions.json', auctions);

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
      const auctions = await readJSON('auctions.json');
      const auctionIndex = auctions.findIndex(a => a.id === auctionId);

      if (auctionIndex === -1) {
        return res.status(404).json({ error: 'Auction not found' });
      }

      const auction = auctions[auctionIndex];

      if (auction.status !== 'active') {
        return res.status(400).json({ error: 'Auction is not active' });
      }

      if (new Date(auction.endTime) < new Date()) {
        return res.status(400).json({ error: 'Auction has ended' });
      }

      if (amount <= auction.currentBid) {
        return res.status(400).json({ error: 'Bid must be higher than current bid' });
      }

      const minBid = auction.currentBid + auction.minIncrement;
      if (amount < minBid) {
        return res.status(400).json({ error: `Minimum bid is ${minBid}` });
      }

      // Create bid
      const bid = {
        id: generateId(),
        auctionId,
        userId: payload.userId,
        amount,
        createdAt: new Date().toISOString()
      };

      const bids = await readJSON('bids.json');
      bids.push(bid);
      await writeJSON('bids.json', bids);

      // Update auction current bid
      auctions[auctionIndex].currentBid = amount;
      await writeJSON('auctions.json', auctions);

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
      const auctions = await readJSON('auctions.json');
      const auctionIndex = auctions.findIndex(a => a.id === auctionId);

      if (auctionIndex === -1) {
        return res.status(404).json({ error: 'Auction not found' });
      }

      // Get highest bid
      const bids = await readJSON('bids.json');
      const auctionBids = bids.filter(b => b.auctionId === auctionId);
      const highestBid = auctionBids.length > 0 
        ? auctionBids.sort((a, b) => b.amount - a.amount)[0] 
        : null;

      // Update auction
      auctions[auctionIndex].status = 'ended';
      auctions[auctionIndex].winnerId = highestBid?.userId || null;
      await writeJSON('auctions.json', auctions);

      return res.json({ success: true, winnerId: highestBid?.userId });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Auctions API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
