// supabase/functions/admin-notify/index.ts
// Sends Discord embed to admin channel
// Deploy: supabase functions deploy admin-notify
// Env vars: DISCORD_BOT_TOKEN, ADMIN_CHANNEL_ID

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    const ADMIN_CHANNEL_ID = Deno.env.get("ADMIN_CHANNEL_ID");

    if (!DISCORD_BOT_TOKEN || !ADMIN_CHANNEL_ID) {
      return new Response(
        JSON.stringify({ error: "Discord config missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, details, ip, fingerprint, password } = await req.json();

    // Build embed based on action type
    const colors: Record<string, number> = {
      NEW_PASSWORD: 0x4ade80,    // green
      LOGIN_SUCCESS: 0x3b82f6,   // blue
      LOGIN_FAIL: 0xfbbf24,      // yellow
      NEW_DEVICE: 0x8b5cf6,      // purple
      SUSPICIOUS: 0xf87171,      // red
      LOCKOUT: 0xef4444,         // dark red
    };

    const titles: Record<string, string> = {
      NEW_PASSWORD: "🔑 New Admin Password Generated",
      LOGIN_SUCCESS: "✅ Admin Login Success",
      LOGIN_FAIL: "⚠️ Admin Login Failed",
      NEW_DEVICE: "📱 New Device Whitelisted",
      SUSPICIOUS: "🚨 Suspicious Login Attempt",
      LOCKOUT: "🔒 IP Locked Out (5 fails)",
    };

    const fields = [
      { name: "Action", value: action, inline: true },
      { name: "IP", value: ip || "unknown", inline: true },
      { name: "Fingerprint", value: fingerprint ? `\`${fingerprint.slice(0, 12)}...\`` : "unknown", inline: true },
      { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    ];

    if (details) {
      fields.push({ name: "Details", value: details, inline: false });
    }

    if (password) {
      fields.push({ name: "🔐 Password", value: `\`\`\`${password}\`\`\``, inline: false });
      fields.push({ name: "⚠️ Warning", value: "This password is shown once. Save it securely.", inline: false });
    }

    const embed = {
      title: titles[action] || `🔔 ${action}`,
      color: colors[action] || 0x9b7fe8,
      fields,
      footer: { text: "Grimz Admin Security" },
      timestamp: new Date().toISOString(),
    };

    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${ADMIN_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      }
    );

    if (!discordRes.ok) {
      const err = await discordRes.text();
      console.error("Discord API error:", err);
      return new Response(
        JSON.stringify({ error: "Discord send failed", detail: err }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
