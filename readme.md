# SiZium Shop — Multi-Serveurs

## Structure JSONBin

Chaque serveur a son propre Bin JSONBin. Crée 11 bins sur [jsonbin.io](https://jsonbin.io) et note leurs IDs.

## Variables d'environnement (Vercel / .env)

```env
# Master key JSONBin (pour l'admin — lecture/écriture)
JSONBIN_MASTER_KEY=ton_master_key

# Un BIN_ID par serveur
JSONBIN_BIN_ID_CORAL=xxx
JSONBIN_BIN_ID_BLUE=xxx
JSONBIN_BIN_ID_ORANGE=xxx
JSONBIN_BIN_ID_YELLOW=xxx
JSONBIN_BIN_ID_WHITE=xxx
JSONBIN_BIN_ID_BLACK=xxx
JSONBIN_BIN_ID_CYAN=xxx
JSONBIN_BIN_ID_LIME=xxx
JSONBIN_BIN_ID_RED=xxx
JSONBIN_BIN_ID_MOCHA=xxx
JSONBIN_BIN_ID_JADE=xxx

# Bot Discord
DISCORD_BOT_TOKEN=xxx
DISCORD_GUILD_ID=xxx
DISCORD_CATEGORY_ID=xxx
DISCORD_STAFF_ROLE_ID=xxx
```

## Côté client (index.html)

Dans le tableau `SERVERS`, remplace chaque `binId` par l'ID du bin correspondant,
et `accessKey` par la clé d'accès public JSONBin (lecture seule).

```js
{ id:"coral", name:"Coral", color:"#FF6B6B", binId:"TON_BIN_ID_CORAL", accessKey:"$2a$10$..." },
```

## Admin — Associer un vendeur à son serveur

Dans `admin/index.html`, dans la map `EMAIL_TO_SERVER`, ajoute :

```js
const EMAIL_TO_SERVER = {
  "vendeur1@exemple.com": "coral",
  "vendeur2@exemple.com": "blue",
  // ...
};
```

Le vendeur ne pourra lire et modifier **que** le catalogue de son serveur.
