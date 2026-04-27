import { createBrowserClient } from "@supabase/ssr";

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey, ok: Boolean(url && anonKey) };
}

export function createSupabaseBrowserClientSafe() {
  const { url, anonKey, ok } = getSupabasePublicEnv();
  if (!ok) return null;
  return createBrowserClient(url!, anonKey!);
}

