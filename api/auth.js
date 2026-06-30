import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

      // Check if user exists
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      // Verify password (in production, use bcrypt)
      if (user.password !== password) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      const token = generateToken(user.id);

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          discordId: user.discord_id,
          role: user.role,
          createdAt: user.created_at
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

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }

      // Create user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email,
          password, // In production, hash this with bcrypt
          role: 'neutral',
          total_orders: 0,
          total_items: 0,
          total_spent: 0
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Erreur lors de la création du compte' });
      }

      const token = generateToken(newUser.id);

      return res.json({
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          discordId: newUser.discord_id,
          role: newUser.role,
          createdAt: newUser.created_at
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
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('discord_id', discordUser.id)
        .single();

      let user;
      if (existingUser) {
        user = existingUser;
        // Update email if changed
        await supabase
          .from('users')
          .update({ email: discordUser.email })
          .eq('id', user.id);
      } else {
        // Create new user
        const { data: newUser } = await supabase
          .from('users')
          .insert({
            email: discordUser.email,
            discord_id: discordUser.id,
            role: 'neutral',
            total_orders: 0,
            total_items: 0,
            total_spent: 0
          })
          .select()
          .single();
        user = newUser;
      }

      const token = generateToken(user.id);

      // Redirect to frontend with token
      return res.redirect(`/?token=${token}`);
    }

    // Verify token
    if (method === 'POST' && path === 'verify') {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Token requis' });
      }

      const payload = verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
      }

      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', payload.userId)
        .single();

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      return res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          discordId: user.discord_id,
          role: user.role,
          totalOrders: user.total_orders,
          totalItems: user.total_items,
          totalSpent: user.total_spent
        }
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
