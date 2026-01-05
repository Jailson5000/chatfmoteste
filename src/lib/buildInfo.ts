// Build info for version verification between Lovable and VPS
// This file is auto-updated during build process

// Current build version - format: YYYY-MM-DD.N
export const APP_BUILD_ID = "2026-01-05.2";

// Build timestamp (ISO format)
export const APP_BUILD_TIMESTAMP = "2026-01-05T16:45:00.000Z";

// Git commit hash (populated during build if available)
export const APP_GIT_COMMIT = import.meta.env.VITE_GIT_COMMIT || "unknown";

// Get build info as object
export function getBuildInfo() {
  return {
    buildId: APP_BUILD_ID,
    timestamp: APP_BUILD_TIMESTAMP,
    gitCommit: APP_GIT_COMMIT,
    environment: import.meta.env.MODE,
  };
}
