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
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Variables Supabase manquantes (SUPABASE_URL / SUPABASE_SERVICE_KEY)" });
    }

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
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/shops?id=eq.${serverId}&select=id,name,color,items`,
        {
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          }
        }
      );

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: "Supabase GET error", detail: err });
      }

      const rows = await r.json();
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: `Serveur '${serverId}' introuvable dans la base` });
      }

      // On retourne le même format que JSONBin pour ne pas casser le front
      // { record: { items: [...] } }
      return res.json({ record: { items: rows[0].items || [] } });
    }

    // ── PUT : sauvegarder les items d'un serveur ───────────────────────────
    if (method === "PUT") {
      const body = req.body || {};
      const items = body.items ?? body;   // compatibilité : { items: [...] } ou directement [...]

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/shops?id=eq.${serverId}`,
        {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ items })
        }
      );

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: "Supabase PATCH error", detail: err });
      }

      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("SUPABASE API ERROR:", err);
    return res.status(500).json({ error: "Internal server error", message: err?.message || String(err) });
  }
}
