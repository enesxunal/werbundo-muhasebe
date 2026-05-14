import { createBrowserClient } from "@supabase/ssr";

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return { url, anonKey, ok: Boolean(url && anonKey) };
}

export function createSupabaseBrowserClientSafe() {
  const { url, anonKey, ok } = getSupabasePublicEnv();
  if (!ok) return null;
  return createBrowserClient(url!, anonKey!);
}
