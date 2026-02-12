/**
 * Meta Platform Configuration
 * 
 * O App ID da Meta é um identificador público (não é segredo).
 * Pode ser usado no frontend sem risco de segurança.
 * 
 * O App Secret (META_APP_SECRET) continua como secret no backend.
 */

// App ID from Meta Developers console
export const META_APP_ID = import.meta.env.VITE_META_APP_ID || "1237829051015100";

// Config ID for WhatsApp Embedded Signup (set via VITE_META_CONFIG_ID when available)
export const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || "";

// Graph API version used across all Meta integrations
export const META_GRAPH_API_VERSION = "v21.0";

// OAuth scopes per channel
export const META_SCOPES = {
  instagram: "instagram_business_basic,instagram_business_manage_messages",
  facebook: "pages_messaging,pages_manage_metadata",
} as const;

/**
 * Build the OAuth URL for Instagram or Facebook login.
 */
export function buildMetaOAuthUrl(type: "instagram" | "facebook"): string {
  const redirectUri = `${window.location.origin}/auth/meta-callback`;
  const scope = META_SCOPES[type];
  const state = JSON.stringify({ type });

  return `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;
}
