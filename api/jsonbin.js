export const config = {
  runtime: "nodejs"
};

// Map server ID → nom de la variable d'environnement contenant le BIN_ID
// Dans ton .env / dashboard Vercel, ajoute :
//   JSONBIN_BIN_ID_CORAL=xxx
//   JSONBIN_BIN_ID_BLUE=xxx
//   ... etc.
const SERVER_BIN_MAP = {
  coral:  "JSONBIN_BIN_ID_CORAL",
  blue:   "JSONBIN_BIN_ID_BLUE",
  orange: "JSONBIN_BIN_ID_ORANGE",
  yellow: "JSONBIN_BIN_ID_YELLOW",
  white:  "JSONBIN_BIN_ID_WHITE",
  black:  "JSONBIN_BIN_ID_BLACK",
  cyan:   "JSONBIN_BIN_ID_CYAN",
  lime:   "JSONBIN_BIN_ID_LIME",
  red:    "JSONBIN_BIN_ID_RED",
  mocha:  "JSONBIN_BIN_ID_MOCHA",
  jade:   "JSONBIN_BIN_ID_JADE",
};

export default async function handler(req, res) {
  try {
    const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
    if (!MASTER_KEY) {
      return res.status(500).json({ error: "JSONBIN_MASTER_KEY manquant" });
    }

    // Récupère le serveur depuis ?server=coral
    // req.query peut être undefined selon le runtime Vercel, on parse l'URL en fallback
    let serverId = req.query?.server || null;
    if (!serverId && req.url) {
      const qs = req.url.includes("?") ? req.url.split("?")[1] : "";
      const params = new URLSearchParams(qs);
      serverId = params.get("server");
    }
    let BIN_ID;

    if (serverId && SERVER_BIN_MAP[serverId]) {
      BIN_ID = process.env[SERVER_BIN_MAP[serverId]];
      if (!BIN_ID) {
        return res.status(500).json({ error: `Variable d'env manquante: ${SERVER_BIN_MAP[serverId]}` });
      }
    } else {
      // Fallback pour compatibilité avec l'ancienne version mono-serveur
      BIN_ID = process.env.JSONBIN_BIN_ID;
      if (!BIN_ID) {
        return res.status(400).json({ error: "Serveur invalide ou non spécifié" });
      }
    }

    const method = req.method;
    if (method !== "GET" && method !== "PUT") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const url = `https://api.jsonbin.io/v3/b/${BIN_ID}${method === "GET" ? "/latest" : ""}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": MASTER_KEY,
        "X-Bin-Versioning": "false"
      }
    };

    if (method === "PUT") {
      options.body = JSON.stringify(req.body || {});
    }

    const r = await fetch(url, options);
    const data = await r.json();
    return res.status(r.status).json(data);

  } catch (err) {
    console.error("SERVERLESS ERROR:", err);
    return res.status(500).json({ error: "Internal server error", message: err?.message || String(err) });
  }
}
