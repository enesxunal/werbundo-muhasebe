import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAssistantContext, type InvoiceRow } from "@/lib/assistant/buildContext";
import { runAssistantChat, type ChatMessage } from "@/lib/assistant/runChat";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  locale: z.enum(["tr", "de"]).optional().default("tr"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12_000),
      }),
    )
    .min(1)
    .max(24),
});

function companyFromMetadata(meta: Record<string, unknown> | undefined) {
  if (!meta) {
    return { name: "", taxNo: "", address: "", city: "" };
  }
  return {
    name: String(meta.company_name ?? "").trim(),
    taxNo: String(meta.company_tax_no ?? "").trim(),
    address: String(meta.company_address ?? "").trim(),
    city: String(meta.company_city ?? "").trim(),
  };
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "SUPABASE_ENV" }, { status: 503 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const locale = parsed.data.locale;
    const messages = parsed.data.messages as ChatMessage[];

    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") {
      return NextResponse.json({ ok: false, error: "LAST_MESSAGE_USER" }, { status: 400 });
    }

    const company = companyFromMetadata(user.user_metadata as Record<string, unknown> | undefined);

    const from = new Date();
    from.setMonth(from.getMonth() - 13);
    const fromIso = from.toISOString().slice(0, 10);

    const { data: invData, error: invErr } = await supabase
      .from("invoices")
      .select("issue_date,total,vat_total,currency,invoice_no, customer:customers(name)")
      .gte("issue_date", fromIso)
      .order("issue_date", { ascending: false })
      .limit(200);

    if (invErr) {
      return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
    }

    const invoices = (invData ?? []) as unknown as InvoiceRow[];
    const contextBlock = buildAssistantContext({ locale, company, invoices });

    const result = await runAssistantChat({
      locale,
      contextBlock,
      messages,
    });

    if (!result.ok) {
      if (result.error === "NO_PROVIDER") {
        return NextResponse.json({ ok: false, error: "NO_PROVIDER" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true, reply: result.reply });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
