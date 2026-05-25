# SiZium Shop — Multi-Serveurs (Supabase)

## Setup Supabase

1. Crée un projet sur [supabase.com](https://supabase.com)
2. Va dans **SQL Editor** et colle le contenu de `supabase_schema.sql`
3. Récupère tes clés dans **Project Settings → API** :
   - `URL` → `SUPABASE_URL`
   - `service_role` (secret) → `SUPABASE_SERVICE_KEY`

## Variables d'environnement (Vercel / .env)

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...   # clé service_role (jamais exposée côté client)

# Bot Discord
DISCORD_BOT_TOKEN=xxx
DISCORD_GUILD_ID=xxx
DISCORD_CATEGORY_ID=xxx
DISCORD_STAFF_ROLE_ID=xxx

# Rôles Discord par serveur (optionnel)
CORAL_ROLE_ID=xxx
BLUE_ROLE_ID=xxx
ORANGE_ROLE_ID=xxx
YELLOW_ROLE_ID=xxx
WHITE_ROLE_ID=xxx
BLACK_ROLE_ID=xxx
CYAN_ROLE_ID=xxx
LIME_ROLE_ID=xxx
RED_ROLE_ID=xxx
MOCHA_ROLE_ID=xxx
JADE_ROLE_ID=xxx
VENDOR_ROLE_ID=xxx
```

## Structure de la table Supabase

```
shops
├── id         TEXT  PRIMARY KEY  (ex: 'coral', 'blue' …)
├── name       TEXT               (ex: 'Coral')
├── color      TEXT               (ex: '#FF6B6B')
├── items      JSONB              (tableau de produits)
└── updated_at TIMESTAMPTZ
```

Chaque serveur = 1 row dans la table `shops`.  
Les items sont stockés en JSONB avec le même format qu'avant :

```json
[
  {
    "id": "paladium_sword",
    "name": "Épée Paladium",
    "cat": "Armes",
    "prices": { "$": 10, "dc": 5 },
    "hidden": false
  }
]
```

## API serverless

- `GET  /api/supabase?server=coral` → retourne `{ record: { items: [...] } }`
- `PUT  /api/supabase?server=coral` + body `{ items: [...] }` → sauvegarde

## Admin — Associer un vendeur à son serveur

Dans `admin/index.html`, dans la map `EMAIL_TO_SERVER` :

```js
const EMAIL_TO_SERVER = {
  "vendeur1@exemple.com": "coral",
  "vendeur2@exemple.com": "blue",
  // ...
};
```
