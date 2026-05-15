import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseUserFromRequest } from "@/lib/supabase/authFromRequest";

export const runtime = "nodejs";

const bodySchema = z.object({
  reconciliationId: z.string().uuid(),
});

export async function POST(req: Request) {
  const auth = await getSupabaseUserFromRequest(req);
  if (!auth.ok) {
    const status = auth.error === "SUPABASE_ENV" ? 503 : 401;
    return NextResponse.json({ ok: false, error: auth.error }, { status });
  }

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const { data: rec, error: fetchErr } = await auth.supabase
    .from("month_reconciliations")
    .select("id, missing_count, user_id")
    .eq("id", parsed.data.reconciliationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (fetchErr || !rec) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (Number(rec.missing_count) > 0) {
    return NextResponse.json({ ok: false, error: "HAS_MISSING" }, { status: 409 });
  }

  const { error } = await auth.supabase
    .from("month_reconciliations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rec.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
