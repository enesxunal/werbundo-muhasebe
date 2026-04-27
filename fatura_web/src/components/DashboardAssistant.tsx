"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/LocaleContext";
import type { Locale } from "@/lib/i18n/dictionaries";

type Msg = { role: "user" | "assistant"; content: string };

export function DashboardAssistant(props: { locale: Locale; disabled?: boolean }) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading && !props.disabled, [input, loading, props.disabled]);

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  async function send() {
    const q = input.trim();
    if (!q || loading || props.disabled) return;

    const nextMsgs: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(nextMsgs);
    setInput("");
    setError(null);
    setLoading(true);
    scrollBottom();

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: props.locale,
          messages: nextMsgs,
        }),
      });

      const json = (await res.json()) as { ok?: boolean; reply?: string; error?: string };

      if (!res.ok || !json.ok || typeof json.reply !== "string") {
        const code = json.error ?? "";
        if (code === "NO_PROVIDER" || code.includes("OPENAI") || code.includes("GEMINI")) {
          setError(t("assistant.noKey"));
        } else if (res.status === 401) {
          setError(t("assistant.needLogin"));
        } else {
          setError(t("assistant.error"));
        }
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

  return (
    <div className="mb-10 rounded-2xl border border-[var(--app-border)] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--app-navy)]">{t("assistant.title")}</h2>
          <p className="mt-1 text-sm text-zinc-600">{t("assistant.subtitle")}</p>
        </div>
        <Link href="/app/profil" className="shrink-0 text-xs text-[var(--app-navy)] underline underline-offset-2">
          {t("assistant.profileLink")}
        </Link>
      </div>

      <p className="mt-2 text-xs text-zinc-500">{t("assistant.profileHint")}</p>

      <div
        ref={scrollRef}
        className="mt-4 max-h-52 overflow-y-auto rounded-xl border border-[var(--app-border)] bg-zinc-50/80 p-3 text-sm"
      >
        {msgs.length === 0 ? (
          <p className="text-zinc-500">{t("assistant.empty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[92%] rounded-xl bg-[var(--app-navy)] px-3 py-2 text-white"
                    : "mr-auto max-w-[92%] rounded-xl border border-[var(--app-border)] bg-white px-3 py-2 text-zinc-800"
                }
              >
                <span className="block whitespace-pre-wrap">{m.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-zinc-500">{t("assistant.thinking")}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("assistant.placeholder")}
          disabled={loading || props.disabled}
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
          className="rounded-xl bg-[var(--app-navy)] px-5 py-2 text-sm font-medium text-white disabled:opacity-45"
        >
          {t("assistant.send")}
        </button>
      </div>

      <p className="mt-3 text-xs text-zinc-400">{t("assistant.disclaimer")}</p>
    </div>
  );
}
