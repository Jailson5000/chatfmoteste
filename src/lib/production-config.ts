/**
 * Production Configuration
 * Centralized configuration for production deployment
 */

// Main production domains
export const PRODUCTION_DOMAINS = {
  main: 'miauchat.com.br',
  www: 'www.miauchat.com.br',
  n8n: 'n8n.miauchat.com.br',
  api: 'api.miauchat.com.br',
};

// Allowed authentication redirect URLs
export const AUTH_REDIRECT_URLS = [
  'https://miauchat.com.br',
  'https://miauchat.com.br/',
  'https://miauchat.com.br/dashboard',
  'https://miauchat.com.br/auth/callback',
  'https://miauchat.com.br/reset-password',
  'https://www.miauchat.com.br',
  'https://www.miauchat.com.br/',
  'https://www.miauchat.com.br/dashboard',
  'https://www.miauchat.com.br/auth/callback',
  'https://www.miauchat.com.br/reset-password',
];

// Check if running in production
export function isProduction(): boolean {
  return typeof window !== 'undefined' && 
    (window.location.hostname === PRODUCTION_DOMAINS.main ||
     window.location.hostname === PRODUCTION_DOMAINS.www ||
     window.location.hostname.endsWith('.miauchat.com.br'));
}

// Get the base URL for the current environment
export function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    return `https://${PRODUCTION_DOMAINS.main}`;
  }
  
  // Production
  if (isProduction()) {
    return `https://${PRODUCTION_DOMAINS.main}`;
  }
  
  // Development/Staging
  return window.location.origin;
}

// Get tenant URL
export function getTenantUrl(subdomain: string, path: string = '/'): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Production - use subdomain
    if (hostname.includes('miauchat.com.br')) {
      return `https://${subdomain}.miauchat.com.br${path}`;
    }
  }
  
  // Development - use query param simulation
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${baseUrl}${path}?tenant=${subdomain}`;
}
