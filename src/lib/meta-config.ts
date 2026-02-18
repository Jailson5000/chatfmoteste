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
  instagram: "pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages",
  facebook: "pages_messaging,pages_manage_metadata,pages_show_list,pages_read_engagement,business_management",
} as const;

/**
 * Returns a fixed redirect URI based on the current environment.
 * For Instagram, always uses the production URI since it must match
 * what's registered in the Meta Dashboard for Instagram Business Login.
 */
export function getFixedRedirectUri(type?: "instagram" | "facebook" | "whatsapp_cloud"): string {
  // Instagram Business Login requires the exact URI registered in Meta Dashboard
  if (type === "instagram") {
    return "https://miauchat.com.br/auth/meta-callback";
  }

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
 * Instagram Business Login uses instagram.com/oauth/authorize with the Instagram App ID.
 * Facebook uses facebook.com/dialog/oauth with the Facebook App ID.
 */
export function buildMetaOAuthUrl(type: "instagram" | "facebook"): string {
  const redirectUri = getFixedRedirectUri(type);
  const scope = META_SCOPES[type];
  const state = JSON.stringify({ type });

  // Both Instagram and Facebook now use the Facebook OAuth dialog
  // Instagram uses Facebook OAuth to access me/accounts and list linked IG business accounts
  return `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;
}
