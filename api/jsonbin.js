export const config = {
  runtime: "nodejs"
};

export default async function handler(req, res) {
  try {
    const BIN_ID = process.env.JSONBIN_BIN_ID;
    const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

    if (!BIN_ID || !MASTER_KEY) {
      return res.status(500).json({
        error: "Missing env vars",
        BIN_ID: !!BIN_ID,
        MASTER_KEY: !!MASTER_KEY
      });
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
    return res.status(500).json({
      error: "Internal server error",
      message: err?.message || String(err)
    });
  }
}
