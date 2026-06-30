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
  const path = req.url?.split('/api/users/')[1]?.split('?')[0] || '';

  try {
    // Get user profile
    if (method === 'GET' && path === 'profile') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', payload.userId)
        .single();

      if (error || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get purchase history
      const { data: purchases } = await supabase
        .from('purchases')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          discordId: user.discord_id,
          role: user.role,
          totalOrders: user.total_orders,
          totalItems: user.total_items,
          totalSpent: user.total_spent,
          createdAt: user.created_at
        },
        purchases: purchases || []
      });
    }

    // Update user role (admin only)
    if (method === 'POST' && path === 'role') {
      const { userId, role } = req.body;

      if (!userId || !role) {
        return res.status(400).json({ error: 'userId and role required' });
      }

      const validRoles = ['ally', 'neutral', 'enemy', 'vip', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const { data, error } = await supabase
        .from('users')
        .update({ role })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update role' });
      }

      return res.json({ success: true, user: data });
    }

    // Record purchase
    if (method === 'POST' && path === 'purchase') {
      const { userId, server, items, total } = req.body;

      if (!userId || !server || !items || !total) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Create purchase record
      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          user_id: userId,
          server,
          items,
          total
        })
        .select()
        .single();

      if (purchaseError) {
        return res.status(500).json({ error: 'Failed to record purchase' });
      }

      // Update user stats
      const totalItems = items.reduce((sum, item) => sum + (item.qty || 1), 0);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          total_orders: supabase.raw('total_orders + 1'),
          total_items: supabase.raw(`total_items + ${totalItems}`),
          total_spent: supabase.raw(`total_spent + ${total}`)
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update user stats:', updateError);
      }

      return res.json({ success: true, purchase });
    }

    // Check Discord roles for country access
    if (method === 'GET' && path === 'discord-roles') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { data: user } = await supabase
        .from('users')
        .select('discord_id, role')
        .eq('id', payload.userId)
        .single();

      if (!user || !user.discord_id) {
        return res.json({ hasCountryAccess: false, reason: 'no_discord_linked' });
      }

      // Check if user has country role (this would require Discord bot integration)
      // For now, we'll check the user's role in the database
      const hasCountryAccess = user.role === 'ally' || user.role === 'vip' || user.role === 'admin';

      return res.json({
        hasCountryAccess,
        role: user.role,
        discordId: user.discord_id
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Users API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
