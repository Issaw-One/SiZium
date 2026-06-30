import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API routes
app.use('/api/create-ticket', (await import('./api/create-ticket.js')).default);
app.use('/api/jsonbin', (await import('./api/jsonbin.js')).default);
app.use('/api/supabase', (await import('./api/supabase.js')).default);

// Auth routes (to be implemented)
app.use('/api/auth', (await import('./api/auth.js')).default);
app.use('/api/auctions', (await import('./api/auctions.js')).default);
app.use('/api/users', (await import('./api/users.js')).default);

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(join(__dirname, 'login.html'));
});

// Serve signup page
app.get('/signup', (req, res) => {
  res.sendFile(join(__dirname, 'signup.html'));
});

// Serve auction page
app.get('/auctions', (req, res) => {
  res.sendFile(join(__dirname, 'auctions.html'));
});

// Serve profile page
app.get('/profile', (req, res) => {
  res.sendFile(join(__dirname, 'profile.html'));
});

// Serve services selection page
app.get('/services', (req, res) => {
  res.sendFile(join(__dirname, 'services.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
