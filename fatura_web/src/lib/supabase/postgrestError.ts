/** Postgrest / Supabase hata nesnesi her zaman Error örneği değildir; mesajı güvenle çıkar. */
export function postgrestErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return typeof err === "string" ? err : "Bilinmeyen hata";
}

/** migration_v2 çalışmadıysa paid_at sütunu yoktur; PostgREST genelde 400 + bu metin döner. */
export function isMissingPaidAtColumnError(err: unknown): boolean {
  const msg = postgrestErrorMessage(err).toLowerCase();
  if (!msg.includes("paid_at")) return false;
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    (msg.includes("column") && msg.includes("unknown"))
  );
}

/** Tablo / görünüm henüz oluşturulmadıysa (migration yapılmadıysa). */
export function isMissingRelationError(err: unknown, nameFragment: string): boolean {
  const msg = postgrestErrorMessage(err).toLowerCase();
  const hint = nameFragment.toLowerCase();
  if (!msg.includes(hint)) return false;
  return msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("could not find");
}
