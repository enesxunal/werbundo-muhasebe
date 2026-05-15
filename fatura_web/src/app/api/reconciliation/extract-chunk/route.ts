import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseUserFromRequest } from "@/lib/supabase/authFromRequest";
import {
  dedupeBankTransactions,
  extractBankTransactionsFromPages,
} from "@/lib/reconciliation/extractBankStatement";
export const runtime = "nodejs";
export const maxDuration = 120;

const pageSchema = z.object({
  mimeType: z.string(),
  base64: z.string().max(1_800_000),
});

const bodySchema = z.object({
  locale: z.enum(["tr", "de"]).optional().default("tr"),
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  pages: z.array(pageSchema).min(1).max(3),
  pageOffset: z.number().int().min(0).default(0),
  totalPages: z.number().int().min(1).max(20),
});

export async function POST(req: Request) {
  try {
    const auth = await getSupabaseUserFromRequest(req);
    if (!auth.ok) {
      const status = auth.error === "SUPABASE_ENV" ? 503 : 401;
      return NextResponse.json({ ok: false, error: auth.error }, { status });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const { periodYear, periodMonth, pages, pageOffset, totalPages, locale } = parsed.data;
    const periodLabel = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;

    const extracted = await extractBankTransactionsFromPages(
      pages.map((p) => ({ mimeType: p.mimeType, base64: p.base64.replace(/\s/g, "") })),
      periodLabel,
    );

    if (!extracted.ok) {
      const msg =
        extracted.error === "AI_BUSY"
          ? locale === "de"
            ? "KI vorübergehend überlastet (503). Bitte 1–2 Minuten warten und erneut versuchen."
            : "Yapay zekâ geçici yoğun (503). 1–2 dakika bekleyip tekrar deneyin."
          : extracted.error;
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      transactions: extracted.transactions,
      pageOffset,
      totalPages,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
