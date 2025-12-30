export async function getFunctionErrorMessage(err: unknown): Promise<string> {
  const anyErr = err as any;
  const fallback = anyErr?.message || "Erro ao executar ação";

  // Supabase functions.invoke errors may include a Response in `context`.
  const context = anyErr?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      if (payload?.message) return String(payload.message);
      if (payload?.error) return String(payload.error);
    } catch {
      // ignore
    }
  }

  if (typeof anyErr?.details === "string" && anyErr.details.trim()) return anyErr.details;

  return fallback;
}
