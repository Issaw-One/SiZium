import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField
} from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ─── Rôle Discord par serveur de la boutique ──────────────────────────────────
// Remplis les IDs dans ton .env :  LIME_ROLE_ID, MOCHA_ROLE_ID, RED_ROLE_ID, BLACK_ROLE_ID
const SERVER_ROLES = {
  coral:  process.env.CORAL_ROLE_ID  || null,
  blue: process.env.BLUE_ROLE_ID || null,
  orange:   process.env.ORANGE_ROLE_ID   || null,
  yellow: process.env.YELLOW_ROLE_ID || null,
  white: process.env.WHITE_ROLE_ID || null,
  black: process.env.BLACK_ROLE_ID || null,
  cyan: process.env.CYAN_ROLE_ID || null,
  lime: process.env.LIME_ROLE_ID || null,
  red: process.env.RED_ROLE_ID || null,
  mocha: process.env.MOCHA_ROLE_ID || null,
  jade: process.env.JADE_ROLE_ID || null,
};

let ready = false;

async function initBot() {
  if (ready) return;
  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN manquant dans .env");
  }
  await client.login(process.env.DISCORD_BOT_TOKEN);
  ready = true;
}

function safeChannelName(str) {
  return String(str || "user")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "user";
}

function extractDiscordId(input = "") {
  const match = String(input).match(/\d{15,20}/);
  return match ? match[0] : null;
}

async function findMemberByUsername(guild, raw) {
  const query = String(raw || "").trim();
  if (!query) return { member: null, reason: "no-input" };

  try {
    const results = await guild.members.search({ query, limit: 10 });
    if (!results || results.size === 0)
      return { member: null, reason: "no-match" };

    const lowered = query.toLowerCase();
    const exact = results.filter(m => {
      const u = m.user;
      const candidates = [u.username, u.globalName, m.displayName]
        .filter(Boolean)
        .map(s => s.toLowerCase());
      return candidates.includes(lowered);
    });

    if (exact.size === 1) return { member: exact.first(), reason: "unique-match" };
    if (exact.size > 1)  return { member: null, reason: "multi-match" };
    if (results.size === 1) return { member: results.first(), reason: "unique-match" };
    return { member: null, reason: "multi-match" };
  } catch {
    return { member: null, reason: "search-failed" };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const {
      username,
      pseudo,
      discordPseudo,
      note = "",
      items,
      totals,
      totalDollar,
      server,        // ← envoyé par la boutique (lime / mocha / red / black)
    } = req.body || {};

    const displayName = username || pseudo || discordPseudo;
    const resolvedTotals = totals || { dollar: totalDollar ?? 0 };

    if (!displayName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const required = ["DISCORD_GUILD_ID", "DISCORD_CATEGORY_ID", "DISCORD_STAFF_ROLE_ID"];
    for (const k of required) {
      if (!process.env[k]) {
        return res.status(500).json({ ok: false, error: `${k} manquant dans .env` });
      }
    }

    await initBot();

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    await guild.roles.fetch();

    // ── Rôle du serveur boutique ──────────────────────────────────────────────
    const serverId     = String(server || "").toLowerCase();
    const serverLabel  = serverId ? serverId.charAt(0).toUpperCase() + serverId.slice(1) : "Inconnu";
    const serverRoleId = SERVER_ROLES[serverId] || null;
    const VENDOR_ROLE_ID  = process.env.VENDOR_ROLE_ID || null; // Rôle vendeur référant

    // ── Résoudre le membre client ─────────────────────────────────────────────
    let clientId = extractDiscordId(discordPseudo);
    let resolvedMember = null;
    let resolveReason = null;

    if (!clientId && discordPseudo) {
      const found = await findMemberByUsername(guild, discordPseudo);
      resolvedMember = found.member;
      resolveReason  = found.reason;
      if (resolvedMember) clientId = resolvedMember.id;
    }

    // ── Récupérer les membres ayant le rôle du serveur ────────────────────────
    let roleMemberOverwrites = [];
    if (serverRoleId) {
      try {
        await guild.members.fetch(); // charge le cache complet
        const membersWithRole = guild.members.cache.filter(m =>
          m.roles.cache.has(serverRoleId)
        );
        roleMemberOverwrites = membersWithRole.map(m => ({
          id: m.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
          ],
        }));
      } catch (e) {
        console.warn(`[create-ticket] Impossible de charger les membres du rôle ${serverRoleId}:`, e.message);
      }
    }

    // ── Permission overwrites ─────────────────────────────────────────────────
    const staffRole = guild.roles.cache.get(process.env.DISCORD_STAFF_ROLE_ID);
    if (!staffRole) {
      return res.status(400).json({ ok: false, error: "Rôle staff introuvable" });
    }

    const permissionOverwrites = [
      // Tout le monde : interdit
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ];

    // Rôle staff général (s'il est différent du rôle serveur)
    if (staffRole.id !== serverRoleId) {
      permissionOverwrites.push({
        id: staffRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }

    // Rôle du serveur boutique (ex: @Lime) → accès complet
    if (serverRoleId) {
      permissionOverwrites.push({
        id: serverRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],
      });
    }

    // Membres individuels du rôle serveur
    permissionOverwrites.push(...roleMemberOverwrites);

    // Le client acheteur (si pas déjà couvert par le rôle)
    if (clientId && !roleMemberOverwrites.some(o => o.id === clientId)) {
      permissionOverwrites.push({
        id: clientId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],
      });
    }

    // ── Créer le channel dans la catégorie unique ─────────────────────────────
    const parentCategory = await guild.channels.fetch(process.env.DISCORD_CATEGORY_ID).catch(() => null);
    if (!parentCategory) {
      return res.status(400).json({ ok: false, error: "Catégorie introuvable" });
    }

    const channel = await guild.channels.create({
      name: `ticket-${serverId || "shop"}-${safeChannelName(displayName)}-${Date.now().toString().slice(-5)}`,
      type: ChannelType.GuildText,
      parent: process.env.DISCORD_CATEGORY_ID,   // ← une seule catégorie pour tous
      permissionOverwrites,
    });

    // ── Message dans le ticket ────────────────────────────────────────────────
    const lines = items
      .map(it => {
        const modeTag = it.mode ? ` [${it.mode}]` : "";
        const total   = it.total ?? ((it.price ?? 0) * (it.qty ?? 1));
        return `• **${it.name ?? "Item"}**${modeTag} x${it.qty ?? 1} — ${it.price ?? 0}$ l'unité → **${total}$**`;
      })
      .join("\n");

    const totalDollarVal = resolvedTotals?.dollar ?? totalDollar ?? 0;

    let addInfo = "";
    if (!clientId && discordPseudo) {
      addInfo =
        `\n⚠️ **Client non ajouté automatiquement**` +
        `\n🧩 Raison: \`${resolveReason}\``;
    } else if (!discordPseudo) {
      addInfo = `\n⚠️ **Aucun Discord fourni**`;
    }
    // Ping rôle du serveur + vendeur référant (toujours pingué)
    const pings = [];
    if (serverRoleId) pings.push(`<@&${serverRoleId}>`);
    if (VENDOR_ROLE_ID) pings.push(`<@&${VENDOR_ROLE_ID}>`);
    if (pings.length === 0) pings.push(`<@&${staffRole.id}>`);
    const pingLine = pings.join(" ");

    await channel.send({
      content:
        `${pingLine}\n` +
        `🧾 **Nouvelle commande** — Serveur **${serverLabel}**\n` +
        `👤 **Pseudo**: ${displayName}\n` +
        `💬 **Discord (saisi)**: ${discordPseudo || "?"}\n` +
        (resolvedMember ? `✅ **Discord (trouvé)**: <@${resolvedMember.id}>\n` : "") +
        `📝 **Note**: ${note || "—"}\n\n` +
        `**Items :**\n${lines}\n\n` +
        `💰 **Total $**: ${totalDollarVal}` +
        addInfo
    });

    return res.json({ ok: true, orderId: channel.id });

  } catch (err) {
    console.error("create-ticket error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Erreur serveur" });
  }
}
