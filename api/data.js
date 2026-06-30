import { readJSON, writeJSON } from '../lib/storage.js';

export const config = {
  runtime: "nodejs"
};

// Serveurs valides (même liste que dans index.html)
const VALID_SERVERS = new Set([
  "coral","blue","orange","yellow","white",
  "black","cyan","lime","red","mocha","jade"
]);

export default async function handler(req, res) {
  try {
    // Récupère ?server=coral depuis la query string
    let serverId = req.query?.server || null;
    if (!serverId && req.url) {
      const qs = req.url.includes("?") ? req.url.split("?")[1] : "";
      const params = new URLSearchParams(qs);
      serverId = params.get("server");
    }

    if (!serverId || !VALID_SERVERS.has(serverId)) {
      return res.status(400).json({ error: "Serveur invalide ou non spécifié" });
    }

    const method = req.method;

    // ── GET : lire les items d'un serveur ──────────────────────────────────
    if (method === "GET") {
      const shops = await readJSON('shops.json');
      const shop = shops.find(s => s.id === serverId);

      if (!shop) {
        return res.status(404).json({ error: `Serveur '${serverId}' introuvable` });
      }

      // On retourne le même format que JSONBin pour ne pas casser le front
      // { record: { items: [...] } }
      return res.json({ record: { items: shop.items || [] } });
    }

    // ── PUT : sauvegarder les items d'un serveur ───────────────────────────
    if (method === "PUT") {
      const body = req.body || {};
      const items = body.items ?? body;   // compatibilité : { items: [...] } ou directement [...]

      const shops = await readJSON('shops.json');
      const shopIndex = shops.findIndex(s => s.id === serverId);

      if (shopIndex === -1) {
        return res.status(404).json({ error: `Serveur '${serverId}' introuvable` });
      }

      shops[shopIndex].items = items;
      await writeJSON('shops.json', shops);

      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("DATA API ERROR:", err);
    return res.status(500).json({ error: "Internal server error", message: err?.message || String(err) });
  }
}
