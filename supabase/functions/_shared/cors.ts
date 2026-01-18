/**
 * Shared CORS configuration for all edge functions
 * Production domains: miauchat.com.br and www.miauchat.com.br
 * Widget domains: any external site embedding the widget (Tray Commerce, etc.)
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

// Check if origin is from Tray Commerce or other known widget hosts
function isWidgetHost(origin: string): boolean {
  return origin.includes('.commercesuite.com.br') || 
         origin.includes('.tray.com.br') ||
         origin.includes('.traycorp.com.br');
}

// Get CORS headers for a specific origin
// For widget endpoints, we allow any origin since the widget can be embedded anywhere
export function getCorsHeaders(origin: string | null, allowAnyOrigin: boolean = false): Record<string, string> {
  // For widget endpoints or if explicitly allowed, permit any origin
  if (allowAnyOrigin && origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    };
  }

  const allowedOrigin = origin && (
    ALLOWED_ORIGINS.includes(origin) || 
    isLovablePreview(origin) ||
    isWidgetHost(origin) ||
    origin.endsWith('.miauchat.com.br')
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
