// supabase/functions/admin-gen-password/index.ts
// Generates new admin password, stores hash in Supabase, sends to Discord
// Deploy: supabase functions deploy admin-gen-password
// Call: supabase functions invoke admin-gen-password --no-verify-jwt
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DISCORD_BOT_TOKEN, ADMIN_CHANNEL_ID

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generatePassword(length = 16): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*_+-=";
  const all = upper + lower + digits + special;

  // Ensure at least one of each type
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  const rest = Array.from({ length: length - 4 }, () =>
    all[Math.floor(Math.random() * all.length)]
  );

  // Shuffle
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    const ADMIN_CHANNEL_ID = Deno.env.get("ADMIN_CHANNEL_ID");

    // Auth check: require service_role or a secret header
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.includes(SERVICE_ROLE_KEY)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Generate password
    const password = generatePassword(16);
    const hash = await sha256(password);

    // Upsert into admin_config
    const { error: upsertErr } = await sb
      .from("admin_config")
      .upsert(
        { key: "admin_pw_hash", value: hash, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: "DB upsert failed", detail: upsertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to Discord
    if (DISCORD_BOT_TOKEN && ADMIN_CHANNEL_ID) {
      const embed = {
        title: "🔑 New Admin Password Generated",
        color: 0x4ade80,
        fields: [
          { name: "🔐 Password", value: `\`\`\`${password}\`\`\``, inline: false },
          { name: "Hash (SHA-256)", value: `\`${hash.slice(0, 20)}...\``, inline: false },
          { name: "Generated At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          { name: "⚠️ Warning", value: "Save this password now. It will NOT be shown again.", inline: false },
        ],
        footer: { text: "Grimz Admin Security" },
        timestamp: new Date().toISOString(),
      };

      await fetch(`https://discord.com/api/v10/channels/${ADMIN_CHANNEL_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Password generated and sent to Discord" }),
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
