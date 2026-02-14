/**
 * Meta Platform Configuration
 * 
 * O App ID da Meta é um identificador público (não é segredo).
 * Pode ser usado no frontend sem risco de segurança.
 * 
 * O App Secret (META_APP_SECRET) continua como secret no backend.
 */

// App ID from Meta Developers console (Facebook)
export const META_APP_ID = import.meta.env.VITE_META_APP_ID || "1237829051015100";

// Instagram App ID (separate from Facebook App ID)
export const META_INSTAGRAM_APP_ID = import.meta.env.VITE_META_INSTAGRAM_APP_ID || "1447135433693990";

// Config ID for WhatsApp Embedded Signup (set via VITE_META_CONFIG_ID when available)
export const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || "1461954655333752";

// Graph API version used across all Meta integrations
export const META_GRAPH_API_VERSION = "v22.0";

// OAuth scopes per channel
export const META_SCOPES = {
  instagram: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights",
  facebook: "pages_messaging,pages_manage_metadata,pages_show_list",
} as const;

/**
 * Returns a fixed redirect URI based on the current environment.
 * This ensures the redirect_uri always matches what's registered in Meta,
 * regardless of which subdomain the user is on.
 */
export function getFixedRedirectUri(): string {
  if (typeof window === "undefined") {
    return "https://miauchat.com.br/auth/meta-callback";
  }
  const origin = window.location.origin;
  if (origin.includes("miauchat.com.br")) {
    return "https://miauchat.com.br/auth/meta-callback";
  }
  return "https://chatfmoteste.lovable.app/auth/meta-callback";
}

/**
 * Build the OAuth URL for Instagram or Facebook login.
 */
export function buildMetaOAuthUrl(type: "instagram" | "facebook"): string {
  const redirectUri = getFixedRedirectUri();
  const scope = META_SCOPES[type];
  const state = JSON.stringify({ type });

  if (type === "instagram") {
    return `https://www.instagram.com/oauth/authorize?client_id=${META_INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code&force_reauth=true`;
  }

  return `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;
}
