/**
 * Temporary debug utilities for login flow.
 * Remove after issue is resolved.
 */

export interface AuthDebugInfo {
  origin: string;
  supabaseUrl: string | undefined;
  redirectTo: string;
  timestamp: string;
}

export function logAuthAttempt(action: string, extra?: Record<string, unknown>): void {
  const info: AuthDebugInfo = {
    origin: typeof window !== 'undefined' ? window.location.origin : 'SSR',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    redirectTo: typeof window !== 'undefined' 
      ? `${window.location.origin}/auth/callback` 
      : '/auth/callback',
    timestamp: new Date().toISOString(),
  };

  console.log(`[AuthDebug] ${action}`, {
    ...info,
    ...extra,
  });
}

export function logAuthError(action: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  
  console.error(`[AuthDebug] ${action} FAILED`, {
    origin: typeof window !== 'undefined' ? window.location.origin : 'SSR',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    errorName,
    errorMessage,
    // Check for network errors
    isNetworkError: errorMessage.includes('Failed to fetch') || 
                    errorMessage.includes('NetworkError') ||
                    errorMessage.includes('ERR_'),
    timestamp: new Date().toISOString(),
  });
}

export function checkSupabaseConfig(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (!url) {
    issues.push('VITE_SUPABASE_URL is missing or undefined');
  } else if (url.includes('localhost')) {
    issues.push(`VITE_SUPABASE_URL contains localhost: ${url}`);
  } else if (!url.startsWith('https://')) {
    issues.push(`VITE_SUPABASE_URL is not HTTPS: ${url}`);
  }
  
  if (!key) {
    issues.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing or undefined');
  }
  
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('localhost') && url && !url.includes('localhost')) {
      // This is fine - local dev hitting remote Supabase
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}
