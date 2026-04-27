import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Route handler'da kullanıcıyı tanır: önce Authorization: Bearer (tarayıcı localStorage oturumu),
 * yoksa çerez tabanlı SSR istemcisi.
 */
export async function getSupabaseUserFromRequest(req: Request): Promise<
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; error: "SUPABASE_ENV" | "UNAUTHORIZED" }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, error: "SUPABASE_ENV" };

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (bearer) {
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user) return { ok: true, supabase, user };
  }

  const cookieSb = await createSupabaseServerClient();
  if (!cookieSb) return { ok: false, error: "SUPABASE_ENV" };

  const {
    data: { user },
    error,
  } = await cookieSb.auth.getUser();

  if (error || !user) return { ok: false, error: "UNAUTHORIZED" };

  return { ok: true, supabase: cookieSb, user };
}
