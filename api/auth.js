import { readJSON, writeJSON, generateId } from '../lib/storage.js';

export const config = {
  runtime: "nodejs"
};

// Simple JWT token generation (in production, use a proper JWT library)
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
  const path = req.url?.split('/api/auth/')[1]?.split('?')[0] || '';

  try {
    // Login
    if (method === 'POST' && path === 'login') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
      }

      const users = await readJSON('users.json');
      const user = users.find(u => u.email === email);

      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      const token = generateToken(user.id);

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          discordId: user.discordId,
          role: user.role,
          createdAt: user.createdAt
        }
      });
    }

    // Signup
    if (method === 'POST' && path === 'signup') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
      }

      const users = await readJSON('users.json');
      
      if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }

      const newUser = {
        id: generateId(),
        email,
        password, // In production, hash this with bcrypt
        discordId: null,
        role: 'neutral',
        totalOrders: 0,
        totalItems: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      await writeJSON('users.json', users);

      const token = generateToken(newUser.id);

      return res.json({
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          discordId: newUser.discordId,
          role: newUser.role,
          createdAt: newUser.createdAt
        }
      });
    }

    // Discord OAuth callback
    if (method === 'GET' && path === 'discord') {
      const { code } = req.query;

      if (!code) {
        // Redirect to Discord OAuth
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20email`;
        return res.redirect(discordAuthUrl);
      }

      // Exchange code for access token
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.DISCORD_REDIRECT_URI,
        }),
      });

      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return res.status(400).json({ error: 'Erreur Discord OAuth' });
      }

      // Get user info
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const discordUser = await userRes.json();

      // Check if user exists by Discord ID
      const users = await readJSON('users.json');
      let user = users.find(u => u.discordId === discordUser.id);

      if (user) {
        // Update email if changed
        user.email = discordUser.email;
        await writeJSON('users.json', users);
      } else {
        // Create new user
        user = {
          id: generateId(),
          email: discordUser.email,
          password: null,
          discordId: discordUser.id,
          role: 'neutral',
          totalOrders: 0,
          totalItems: 0,
          totalSpent: 0,
          createdAt: new Date().toISOString()
        };
        users.push(user);
        await writeJSON('users.json', users);
      }

      const token = generateToken(user.id);

      // Redirect to frontend with token
      return res.redirect(`/?token=${token}`);
    }

    // Verify token
    if (method === 'POST' && path === 'verify') {
      const { token: reqToken } = req.body;

      if (!reqToken) {
        return res.status(400).json({ error: 'Token requis' });
      }

      const payload = verifyToken(reqToken);

      if (!payload) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
      }

      const users = await readJSON('users.json');
      const user = users.find(u => u.id === payload.userId);

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      return res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          discordId: user.discordId,
          role: user.role,
          totalOrders: user.totalOrders,
          totalItems: user.totalItems,
          totalSpent: user.totalSpent
        }
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
