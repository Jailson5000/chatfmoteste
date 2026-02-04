/**
 * In-memory rate limiter for Edge Functions
 * Protects against flood/DDoS attacks by limiting requests per IP
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60_000, // 1 minute
};

const store = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired entries when store gets too large
function cleanupExpired() {
  const now = Date.now();
  if (store.size > 10_000) {
    for (const [key, value] of store.entries()) {
      if (value.resetAt < now) store.delete(key);
    }
  }
}

export function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const { maxRequests, windowMs } = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  cleanupExpired();

  const record = store.get(identifier);

  if (!record || record.resetAt < now) {
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

export function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(
  retryAfter: number = 60,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      error: "Muitas requisições. Tente novamente em alguns segundos.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        ...corsHeaders,
      },
    }
  );
}
