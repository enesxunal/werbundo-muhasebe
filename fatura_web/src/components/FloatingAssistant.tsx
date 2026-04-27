"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClientSafe, getSupabasePublicEnv } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/LocaleContext";

type Msg = { role: "user" | "assistant"; content: string };

function mapAssistantFetchError(res: Response, code: string, t: (path: string) => string): string {
  const c = code ?? "";
  if (c === "NO_PROVIDER" || c === "GEMINI_API_KEY" || c === "OPENAI_API_KEY") return t("assistant.noKey");
  if (res.status === 401 || c === "UNAUTHORIZED") return t("assistant.needLogin");
  if (
    c.startsWith("LLM_OPENAI_HTTP") ||
    c.startsWith("LLM_GEMINI_HTTP") ||
    c.startsWith("LLM_OPENAI_EMPTY") ||
    c.startsWith("LLM_GEMINI_EMPTY") ||
    c.startsWith("OPENAI_API_KEY") ||
    c.startsWith("GEMINI_API_KEY")
  ) {
    return t("assistant.llmFail");
  }
  return t("assistant.error");
}

export function FloatingAssistant() {
  const { t, locale } = useI18n();
  const env = useMemo(() => getSupabasePublicEnv(), []);
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);

  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) {
      setSessionOk(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionOk(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSessionOk(!!sess);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const disabled = !env.ok || sessionOk !== true;

  const canSend = useMemo(() => input.trim().length > 0 && !loading && !disabled, [input, loading, disabled]);

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  async function send() {
    const q = input.trim();
    if (!q || loading || disabled) return;

    const nextMsgs: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(nextMsgs);
    setInput("");
    setError(null);
    setLoading(true);
    scrollBottom();

    try {
      if (supabase) {
        await supabase.auth.refreshSession();
      }
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({
          locale,
          messages: nextMsgs,
        }),
      });

      let json: { ok?: boolean; reply?: string; error?: string };
      try {
        json = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
      } catch {
        setError(t("assistant.error"));
        setLoading(false);
        scrollBottom();
        return;
      }

      if (!res.ok || !json.ok || typeof json.reply !== "string") {
        setError(mapAssistantFetchError(res, String(json.error ?? ""), t));
        setLoading(false);
        scrollBottom();
        return;
      }

      setMsgs([...nextMsgs, { role: "assistant", content: json.reply }]);
    } catch {
      setError(t("assistant.error"));
    } finally {
      setLoading(false);
      scrollBottom();
    }
  }

  if (!env.ok || sessionOk !== true) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
      {open ? (
        <section
          id="floating-assistant-panel"
          className="flex max-h-[min(520px,calc(100dvh-7rem))] w-[min(100vw-2rem,400px)] flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-white shadow-2xl"
          aria-label={t("assistant.title")}
        >
          <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-navy)] px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{t("assistant.title")}</p>
              <p className="mt-1 text-xs font-normal text-white/85">{t("assistant.widgetHint")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/app/profil"
                className="rounded-lg px-2 py-1 text-xs text-white/95 underline-offset-2 hover:underline"
              >
                {t("assistant.profileLink")}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white hover:bg-white/15"
                aria-label={t("assistant.closeChat")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="min-h-[140px] flex-1 overflow-y-auto px-4 py-3 text-sm"
          >
            {msgs.length === 0 ? (
              <div className="space-y-3">
                <div className="mr-auto max-w-[95%] rounded-xl border border-[var(--app-border)] bg-zinc-50 px-3 py-3 text-zinc-800">
                  <p className="whitespace-pre-wrap leading-relaxed">{t("assistant.greeting")}</p>
                </div>
                <p className="text-xs text-zinc-500">{t("assistant.profileHint")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[92%] rounded-xl bg-[var(--app-navy)] px-3 py-2 text-white"
                        : "mr-auto max-w-[92%] rounded-xl border border-[var(--app-border)] bg-zinc-50 px-3 py-2 text-zinc-800"
                    }
                  >
                    <span className="block whitespace-pre-wrap">{m.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loading ? <p className="shrink-0 px-4 text-xs text-zinc-500">{t("assistant.thinking")}</p> : null}
          {error ? (
            <p className="shrink-0 px-4 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="shrink-0 border-t border-[var(--app-border)] p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("assistant.placeholder")}
                disabled={loading}
                className="min-h-[44px] flex-1 resize-y rounded-xl border border-[var(--app-border)] bg-white px-3 py-2 text-sm outline-none focus:ring disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void send()}
                className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-45"
              >
                {t("assistant.send")}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-zinc-400">{t("assistant.disclaimer")}</p>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--app-navy)] text-white shadow-lg ring-2 ring-white transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--app-navy)]/35"
        aria-expanded={open}
        aria-controls="floating-assistant-panel"
        aria-label={open ? t("assistant.closeChat") : t("assistant.openChat")}
      >
        {open ? (
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
            <path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
