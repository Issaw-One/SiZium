-- ============================================================
-- SiZium — Schéma Supabase (remplace JSONBin)
-- À coller dans l'éditeur SQL de ton dashboard Supabase
-- ============================================================

-- Table principale : un row par serveur, items stockés en JSONB
CREATE TABLE IF NOT EXISTS shops (
  id        TEXT PRIMARY KEY,   -- ex: 'coral', 'blue', 'lime' …
  name      TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT '#FFFFFF',
  items     JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Insérer les 11 serveurs (items vides, tu les remplis via l'admin)
INSERT INTO shops (id, name, color) VALUES
  ('coral',  'Coral',  '#FF6B6B'),
  ('blue',   'Blue',   '#4A9EFF'),
  ('orange', 'Orange', '#FF9500'),
  ('yellow', 'Yellow', '#FFD60A'),
  ('white',  'White',  '#C8C8C8'),
  ('black',  'Black',  '#666666'),
  ('cyan',   'Cyan',   '#00D4D4'),
  ('lime',   'Lime',   '#7ED321'),
  ('red',    'Red',    '#FF3030'),
  ('mocha',  'Mocha',  '#C8845A'),
  ('jade',   'Jade',   '#00A86B')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Users table for authentication and purchase history
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password      TEXT,  -- In production, this should be hashed
  discord_id    TEXT UNIQUE,
  role          TEXT NOT NULL DEFAULT 'neutral', -- 'ally', 'neutral', 'enemy', etc.
  total_orders  INTEGER DEFAULT 0,
  total_items   INTEGER DEFAULT 0,
  total_spent   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Trigger for users updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Auctions table
-- ============================================================
CREATE TABLE IF NOT EXISTS auctions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name     TEXT NOT NULL,
  item_image    TEXT,
  description   TEXT,
  starting_bid  INTEGER NOT NULL,
  current_bid   INTEGER NOT NULL,
  min_increment INTEGER DEFAULT 1,
  end_time      TIMESTAMPTZ NOT NULL,
  seller_id     UUID REFERENCES users(id),
  winner_id     UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'active', -- 'active', 'ended', 'cancelled'
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Trigger for auctions updated_at
CREATE TRIGGER auctions_updated_at
  BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Bids table
-- ============================================================
CREATE TABLE IF NOT EXISTS bids (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id    UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  amount        INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Purchase history table
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  server        TEXT NOT NULL,
  items         JSONB NOT NULL,
  total         INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

-- Lecture publique (la boutique front lit les items sans auth)
CREATE POLICY "public_read" ON shops
  FOR SELECT USING (true);

-- Écriture uniquement via la service_role key (ton API serverless)
CREATE POLICY "service_write" ON shops
  FOR ALL USING (auth.role() = 'service_role');

-- Users RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_service_write" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- Auctions RLS
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auctions_public_read" ON auctions
  FOR SELECT USING (true);

CREATE POLICY "auctions_service_write" ON auctions
  FOR ALL USING (auth.role() = 'service_role');

-- Bids RLS
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bids_public_read" ON bids
  FOR SELECT USING (true);

CREATE POLICY "bids_service_write" ON bids
  FOR ALL USING (auth.role() = 'service_role');

-- Purchases RLS
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_read_own" ON purchases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "purchases_service_write" ON purchases
  FOR ALL USING (auth.role() = 'service_role');
