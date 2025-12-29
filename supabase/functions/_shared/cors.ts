/**
 * Shared CORS configuration for all edge functions
 * Production domains: miauchat.com.br and www.miauchat.com.br
 */

// Allowed origins for production
const ALLOWED_ORIGINS = [
  'https://miauchat.com.br',
  'https://www.miauchat.com.br',
  // Development/staging origins
  'http://localhost:5173',
  'http://localhost:3000',
  // Lovable preview domains
];

// Check if origin is from Lovable preview (dynamic subdomains)
function isLovablePreview(origin: string): boolean {
  return origin.includes('.lovableproject.com') || origin.includes('.lovable.app');
}

// Get CORS headers for a specific origin
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (
    ALLOWED_ORIGINS.includes(origin) || 
    isLovablePreview(origin) ||
    origin.endsWith('.miauchat.com.br') // Allow all subdomains
  ) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours cache for preflight
  };
}

// Standard CORS headers (for backwards compatibility with existing functions)
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
};

// Handle OPTIONS preflight request
export function handleCorsPreflightRequest(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin');
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(origin),
    });
  }
  return null;
}

// Create response with proper CORS headers
export function createCorsResponse(
  body: unknown,
  status: number,
  req: Request
): Response {
  const origin = req.headers.get('origin');
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });
}
