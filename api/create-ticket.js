import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField
} from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

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
  // Discord: lettres/chiffres/tirets, éviter espaces/caractères spéciaux
  const base = String(username || "user").toLowerCase().trim();
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève accents
    .replace(/[^a-z0-9-_]/g, "-")    // remplace le reste par -
    .replace(/-+/g, "-")            // évite ----
    .replace(/^-|-$/g, "");         // enlève - en début/fin

  return cleaned || "user";
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
      totalPBS
    } = req.body || {};

    // Accepte "username" ou "pseudo" (compatibilité front)
    const displayName = username || pseudo || discordPseudo;
    // Accepte "totals" ou les champs séparés totalDollar/totalPBS
    const resolvedTotals = totals || { dollar: totalDollar ?? 0, pbs: totalPBS ?? 0 };

    if (!displayName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    // Vérifie les variables d'env nécessaires
    const required = [
      "DISCORD_GUILD_ID",
      "DISCORD_CATEGORY_ID",
      "DISCORD_STAFF_ROLE_ID"
    ];
    for (const k of required) {
      if (!process.env[k]) {
        return res.status(500).json({ ok: false, error: `${k} manquant dans .env` });
      }
    }

    await initBot();

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);

    // ✅ Charge les rôles pour être sûr qu'ils sont résolus/cachés
    await guild.roles.fetch();

    const staffRole = guild.roles.cache.get(process.env.DISCORD_STAFF_ROLE_ID);
    if (!staffRole) {
      return res.status(400).json({
        ok: false,
        error: "Rôle staff introuvable (DISCORD_STAFF_ROLE_ID invalide)"
      });
    }

    // ✅ Vérifie (optionnel) que la catégorie existe
    const parentCategory = await guild.channels.fetch(process.env.DISCORD_CATEGORY_ID).catch(() => null);
    if (!parentCategory) {
      return res.status(400).json({
        ok: false,
        error: "Catégorie introuvable (DISCORD_CATEGORY_ID invalide)"
      });
    }

    const channel = await guild.channels.create({
      name: `ticket-${safeChannelName(displayName)}`,
      type: ChannelType.GuildText,
      parent: process.env.DISCORD_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.id, // ✅ @everyone
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: staffRole.id, // ✅ rôle staff
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

    const lines = items
      .map((i) => {
        const name = i?.name ?? "Item";
        const qty = Number(i?.qty ?? 1);
        const unit = Number(i?.unitPrice ?? 0);
        const mode = i?.mode ?? "?";
        const total = Number(i?.total ?? unit * qty);
        return `• **${name}** — ${qty} × ${unit} ${mode} = **${total} ${mode}**`;
      })
      .join("\n");

    const totalDollarVal = resolvedTotals?.dollar ?? 0;
    const totalPBSVal = resolvedTotals?.pbs ?? 0;

    await channel.send({
      content:
`🧾 **NOUVEAU TICKET**
👤 **Pseudo :** ${displayName}

${lines}

💰 **Total $ :** ${totalDollarVal}
🪙 **Total PBS :** ${totalPBSVal}

📝 **Note :**
${note || "Aucune"}`
    });

    return res.json({ ok: true, orderId: channel.id });
  } catch (err) {
    console.error("create-ticket error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Erreur serveur"
    });
  }
}
