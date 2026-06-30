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

      const users = await readJSON('users.json');
      const user = users.find(u => u.id === payload.userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get purchase history
      const purchases = await readJSON('purchases.json');
      const userPurchases = purchases
        .filter(p => p.userId === payload.userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 20);

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          discordId: user.discordId,
          role: user.role,
          totalOrders: user.totalOrders,
          totalItems: user.totalItems,
          totalSpent: user.totalSpent,
          createdAt: user.createdAt
        },
        purchases: userPurchases
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

      const users = await readJSON('users.json');
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
      }

      users[userIndex].role = role;
      await writeJSON('users.json', users);

      return res.json({ success: true, user: users[userIndex] });
    }

    // Record purchase
    if (method === 'POST' && path === 'purchase') {
      const { userId, server, items, total } = req.body;

      if (!userId || !server || !items || !total) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Create purchase record
      const purchase = {
        id: generateId(),
        userId,
        server,
        items,
        total,
        createdAt: new Date().toISOString()
      };

      const purchases = await readJSON('purchases.json');
      purchases.push(purchase);
      await writeJSON('purchases.json', purchases);

      // Update user stats
      const users = await readJSON('users.json');
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex !== -1) {
        const totalItems = items.reduce((sum, item) => sum + (item.qty || 1), 0);
        users[userIndex].totalOrders = (users[userIndex].totalOrders || 0) + 1;
        users[userIndex].totalItems = (users[userIndex].totalItems || 0) + totalItems;
        users[userIndex].totalSpent = (users[userIndex].totalSpent || 0) + total;
        await writeJSON('users.json', users);
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

      const users = await readJSON('users.json');
      const user = users.find(u => u.id === payload.userId);

      if (!user || !user.discordId) {
        return res.json({ hasCountryAccess: false, reason: 'no_discord_linked' });
      }

      // Check if user has country role (this would require Discord bot integration)
      // For now, we'll check the user's role in the database
      const hasCountryAccess = user.role === 'ally' || user.role === 'vip' || user.role === 'admin';

      return res.json({
        hasCountryAccess,
        role: user.role,
        discordId: user.discordId
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Users API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
