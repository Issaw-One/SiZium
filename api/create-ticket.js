import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField
} from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const ROLE_PING_1 = "1324035976510701608";
const ROLE_PING_2 = "1324036332133290045";

let ready = false;

async function initBot() {
  if (ready) return;
  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN manquant dans .env");
  }
  await client.login(process.env.DISCORD_BOT_TOKEN);
  ready = true;
}

function safeChannelName(username) {
  const base = String(username || "user").toLowerCase().trim();
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "user";
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
    if (exact.size > 1) return { member: null, reason: "multi-match" };
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

    const staffRole = guild.roles.cache.get(process.env.DISCORD_STAFF_ROLE_ID);
    if (!staffRole) {
      return res.status(400).json({ ok: false, error: "Rôle staff introuvable" });
    }

    const parentCategory = await guild.channels.fetch(process.env.DISCORD_CATEGORY_ID).catch(() => null);
    if (!parentCategory) {
      return res.status(400).json({ ok: false, error: "Catégorie introuvable" });
    }

    // Résolution du membre Discord
    let clientId = extractDiscordId(discordPseudo);
    let resolvedMember = null;
    let resolveReason = null;

    if (!clientId && discordPseudo) {
      const found = await findMemberByUsername(guild, discordPseudo);
      resolvedMember = found.member;
      resolveReason = found.reason;
      if (resolvedMember) clientId = resolvedMember.id;
    }

    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: staffRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ];

    if (clientId) {
      permissionOverwrites.push({
        id: clientId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ]
      });
    }

    const channel = await guild.channels.create({
      name: `ticket-${safeChannelName(displayName)}-${Date.now().toString().slice(-5)}`,
      type: ChannelType.GuildText,
      parent: process.env.DISCORD_CATEGORY_ID,
      permissionOverwrites
    });

    const lines = items
      .map(it =>
        `• ${it.name ?? "Item"}${it.desc ? ` (${it.desc})` : ""} x${it.qty ?? 1} — ${it.price ?? 0}$`
      )
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

    await channel.send({
      content:
        `<@&${ROLE_PING_1}> <@&${ROLE_PING_2}>\n` +
        `🧾 **Nouvelle commande**\n` +
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
