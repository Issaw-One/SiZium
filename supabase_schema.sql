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
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

-- Lecture publique (la boutique front lit les items sans auth)
CREATE POLICY "public_read" ON shops
  FOR SELECT USING (true);

-- Écriture uniquement via la service_role key (ton API serverless)
-- Les INSERT/UPDATE/DELETE depuis le client JS public sont bloqués.
-- Seule ta clé SUPABASE_SERVICE_KEY peut écrire.
CREATE POLICY "service_write" ON shops
  FOR ALL USING (auth.role() = 'service_role');
