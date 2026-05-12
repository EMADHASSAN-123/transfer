import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

let client = null;
let configError = null;

async function loadConfig() {
  try {
    const mod = await import("./configone.js");
    const url = mod.SUPABASE_URL?.trim?.();
    const key = mod.SUPABASE_ANON_KEY?.trim?.();
    if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("YOUR_SUPABASE")) {
      configError = new Error("Configure js/configone.js (copy from config.example.js).");
      return null;
    }
    return { url, key };
  } catch {
    configError = new Error("Missing js/configone.js — copy js/config.example.js to js/.js.");
    return null;
  }
}

export async function getSupabase() {
  if (client) return client;
  const cfg = await loadConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export function getConfigError() {
  return configError;
}
