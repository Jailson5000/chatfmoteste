/**
 * WhatsApp Provider Abstraction Layer
 * 
 * Provides a unified interface for Evolution API and uazapi.
 * Each instance in whatsapp_instances has an `api_provider` column
 * that determines which provider implementation to use.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ProviderType = 'evolution' | 'uazapi';

export interface ProviderConfig {
  provider: ProviderType;
  apiUrl: string;    // Evolution: server URL, uazapi: https://{subdomain}.uazapi.com
  apiKey: string;    // Evolution: apikey header, uazapi: token header
  instanceName: string;
}

export interface SendTextOptions {
  number: string;        // Phone number without @s.whatsapp.net (e.g. "5511999999999")
  text: string;
  quotedMessageId?: string; // WhatsApp message ID for quoted reply
}

export interface SendMediaOptions {
  number: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  fileName?: string;
  caption?: string;
  mimeType?: string;
}

export interface ConnectResult {
  qrCode: string | null;
  status: string;       // 'awaiting_qr' | 'connected' | 'connecting'
  raw?: unknown;
}

export interface StatusResult {
  status: string;       // Normalized: 'connected' | 'connecting' | 'disconnected'
  evolutionState?: string;
  phoneNumber?: string | null;
}

export interface WebhookConfig {
  webhookUrl: string;
  events?: string[];
}

export interface SendTextResult {
  success: boolean;
  whatsappMessageId?: string;
  raw?: unknown;
}

export interface SendMediaResult {
  success: boolean;
  whatsappMessageId?: string;
  raw?: unknown;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

const DEFAULT_TIMEOUT_MS = 15000;
const SEND_TIMEOUT_MS = 30000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    const err = error as any;
    if (err === "timeout" || err?.name === "AbortError") {
      throw new Error("timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.replace(/\/+$/, "");
  normalized = normalized.replace(/\/manager$/i, "");
  return normalized;
}

// ============================================================================
// EVOLUTION PROVIDER
// ============================================================================

const EvolutionProvider = {
  async sendText(config: ProviderConfig, opts: SendTextOptions): Promise<SendTextResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const payload: Record<string, unknown> = {
      number: opts.number,
      text: opts.text,
    };

    if (opts.quotedMessageId) {
      payload.quoted = { key: { id: opts.quotedMessageId } };
    }

    const res = await fetchWithTimeout(
      `${apiUrl}/message/sendText/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Evolution sendText failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));
    const whatsappMessageId = data?.key?.id || data?.messageId || data?.id || null;

    return { success: true, whatsappMessageId, raw: data };
  },

  async sendMedia(config: ProviderConfig, opts: SendMediaOptions): Promise<SendMediaResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const payload: Record<string, unknown> = {
      number: opts.number,
      mediatype: opts.mediaType,
      caption: opts.caption || "",
      fileName: opts.fileName || "",
    };

    if (opts.mediaBase64) {
      payload.media = opts.mediaBase64;
    } else if (opts.mediaUrl) {
      payload.media = opts.mediaUrl;
    }

    if (opts.mimeType) {
      payload.mimetype = opts.mimeType;
    }

    const res = await fetchWithTimeout(
      `${apiUrl}/message/sendMedia/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Evolution sendMedia failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));
    const whatsappMessageId = data?.key?.id || data?.messageId || null;

    return { success: true, whatsappMessageId, raw: data };
  },

  async connect(config: ProviderConfig): Promise<ConnectResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const res = await fetchWithTimeout(
      `${apiUrl}/instance/connect/${config.instanceName}`,
      {
        method: "GET",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Evolution connect failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));

    // Extract QR code from various response formats
    const qrCode = data?.base64 || data?.qrcode?.base64 ||
      (typeof data?.qrcode === "string" && data.qrcode.length > 10 ? data.qrcode : null) ||
      data?.code || null;

    const state = data?.instance?.state || data?.state || "unknown";
    let status = "awaiting_qr";
    if (state === "open" || state === "connected") status = "connected";
    else if (state === "connecting") status = "connecting";

    return { qrCode, status, raw: data };
  },

  async getStatus(config: ProviderConfig): Promise<StatusResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const res = await fetchWithTimeout(
      `${apiUrl}/instance/connectionState/${config.instanceName}`,
      {
        method: "GET",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      return { status: "disconnected" };
    }

    const data = await res.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || "unknown";

    let status = "disconnected";
    if (state === "open" || state === "connected") status = "connected";
    else if (state === "connecting" || state === "qr") status = "connecting";

    // Try to extract phone number
    const phoneNumber = extractPhoneFromEvolutionPayload(data);

    return { status, evolutionState: state, phoneNumber };
  },

  async configureWebhook(config: ProviderConfig, webhookConfig: WebhookConfig): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const payload = {
      enabled: true,
      url: webhookConfig.webhookUrl,
      webhookByEvents: false,
      webhookBase64: true,
      events: webhookConfig.events || [
        "CONNECTION_UPDATE",
        "QRCODE_UPDATED",
        "MESSAGES_UPSERT",
        "MESSAGES_DELETE",
        "CONTACTS_UPDATE",
      ],
    };

    const res = await fetchWithTimeout(
      `${apiUrl}/webhook/set/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Evolution configureWebhook failed (${res.status}): ${text.slice(0, 300)}`);
    }
  },

  async disconnect(config: ProviderConfig): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/instance/logout/${config.instanceName}`,
      {
        method: "DELETE",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    ).catch(() => { /* best effort */ });
  },

  async deleteInstance(config: ProviderConfig): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/instance/delete/${config.instanceName}`,
      {
        method: "DELETE",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    ).catch(() => { /* best effort */ });
  },

  async createInstance(config: ProviderConfig, webhookUrl: string): Promise<ConnectResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const res = await fetchWithTimeout(
      `${apiUrl}/instance/create`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instanceName: config.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: true,
            events: [
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
              "MESSAGES_UPSERT",
              "MESSAGES_DELETE",
              "CONTACTS_UPDATE",
            ],
          },
        }),
      },
      30000,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Evolution createInstance failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));

    const qrCode = data?.qrcode?.base64 ||
      (typeof data?.qrcode === "string" && data.qrcode.length > 10 ? data.qrcode : null) ||
      data?.base64 || data?.code || null;

    return { qrCode, status: qrCode ? "awaiting_qr" : "disconnected", raw: data };
  },

  async deleteMessage(config: ProviderConfig, remoteJid: string, messageId: string, isFromMe: boolean): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/chat/deleteMessageForEveryone/${config.instanceName}`,
      {
        method: "DELETE",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: messageId,
          remoteJid,
          fromMe: isFromMe,
        }),
      },
    );
  },

  async sendReaction(config: ProviderConfig, remoteJid: string, messageId: string, reaction: string, isFromMe: boolean): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/message/sendReaction/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: {
            remoteJid,
            id: messageId,
            fromMe: isFromMe,
          },
          reaction,
        }),
      },
      SEND_TIMEOUT_MS,
    );
  },
};

// Evolution payload phone extraction helper
function extractPhoneFromEvolutionPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  const candidates = [
    (p.instance as any)?.ownerJid,
    (p.instance as any)?.owner,
    p.ownerJid,
    p.owner,
    (p.me as any)?.id,
  ];

  for (const c of candidates) {
    if (typeof c === "string") {
      const num = c.split("@")[0];
      if (num && num.length >= 10 && num.length <= 15) return num;
    }
  }
  return null;
}

// ============================================================================
// UAZAPI PROVIDER
// ============================================================================

const UazapiProvider = {
  async sendText(config: ProviderConfig, opts: SendTextOptions): Promise<SendTextResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const payload: Record<string, unknown> = {
      number: opts.number,
      text: opts.text,
    };

    if (opts.quotedMessageId) {
      payload.quotedMsgId = opts.quotedMessageId;
    }

    const res = await fetchWithTimeout(
      `${apiUrl}/send/text`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`uazapi sendText failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));
    const whatsappMessageId = data?.key?.id || data?.id || data?.messageId || null;

    return { success: true, whatsappMessageId, raw: data };
  },

  async sendMedia(config: ProviderConfig, opts: SendMediaOptions): Promise<SendMediaResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const payload: Record<string, unknown> = {
      number: opts.number,
      type: opts.mediaType,
      caption: opts.caption || "",
    };

    if (opts.mediaBase64) {
      payload.base64 = opts.mediaBase64;
      payload.mimetype = opts.mimeType || "application/octet-stream";
    } else if (opts.mediaUrl) {
      payload.url = opts.mediaUrl;
    }

    if (opts.fileName) {
      payload.fileName = opts.fileName;
    }

    const res = await fetchWithTimeout(
      `${apiUrl}/send/media`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`uazapi sendMedia failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));
    const whatsappMessageId = data?.key?.id || data?.id || data?.messageId || null;

    return { success: true, whatsappMessageId, raw: data };
  },

  async connect(config: ProviderConfig): Promise<ConnectResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const res = await fetchWithTimeout(
      `${apiUrl}/instance/connect`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`uazapi connect failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));

    // uazapi returns QR as base64 directly
    const qrCode = data?.qrcode || data?.base64 || data?.qr || null;
    const state = data?.status || data?.state || "unknown";
    
    let status = "awaiting_qr";
    if (state === "connected" || state === "open") status = "connected";
    else if (state === "connecting") status = "connecting";

    return { qrCode, status, raw: data };
  },

  async getStatus(config: ProviderConfig): Promise<StatusResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const res = await fetchWithTimeout(
      `${apiUrl}/instance/status`,
      {
        method: "GET",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      return { status: "disconnected" };
    }

    const data = await res.json().catch(() => ({}));
    const state = data?.status || data?.state || "unknown";

    let status = "disconnected";
    if (state === "connected" || state === "open") status = "connected";
    else if (state === "connecting" || state === "qr") status = "connecting";

    const phoneNumber = data?.phone || data?.number || data?.ownerJid?.split("@")[0] || null;

    return { status, phoneNumber };
  },

  async configureWebhook(config: ProviderConfig, webhookConfig: WebhookConfig): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);

    const payload = {
      url: webhookConfig.webhookUrl,
      enabled: true,
      // uazapi anti-loop: exclude messages sent by the API itself
      excludeMessages: ["wasSentByApi"],
    };

    const res = await fetchWithTimeout(
      `${apiUrl}/webhook`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`uazapi configureWebhook failed (${res.status}): ${text.slice(0, 300)}`);
    }
  },

  async disconnect(config: ProviderConfig): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/instance/disconnect`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    ).catch(() => { /* best effort */ });
  },

  async deleteInstance(config: ProviderConfig): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/instance`,
      {
        method: "DELETE",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
      },
    ).catch(() => { /* best effort */ });
  },

  async createInstance(_config: ProviderConfig, _webhookUrl: string): Promise<ConnectResult> {
    // uazapi: instances are pre-provisioned via admin panel
    // "Creating" an instance means connecting to an existing uazapi instance
    return UazapiProvider.connect(_config);
  },

  async deleteMessage(config: ProviderConfig, _remoteJid: string, messageId: string, _isFromMe: boolean): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/message/delete`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId }),
      },
    ).catch(() => { /* best effort */ });
  },

  async sendReaction(config: ProviderConfig, _remoteJid: string, messageId: string, reaction: string, _isFromMe: boolean): Promise<void> {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(
      `${apiUrl}/send/reaction`,
      {
        method: "POST",
        headers: {
          token: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId,
          reaction,
        }),
      },
      SEND_TIMEOUT_MS,
    ).catch(() => { /* best effort */ });
  },
};

// ============================================================================
// PUBLIC API - PROVIDER RESOLVER
// ============================================================================

export function getProviderConfig(instance: {
  api_provider?: string;
  api_url: string;
  api_key: string | null;
  instance_name: string;
}): ProviderConfig {
  return {
    provider: (instance.api_provider || 'evolution') as ProviderType,
    apiUrl: instance.api_url,
    apiKey: instance.api_key || '',
    instanceName: instance.instance_name,
  };
}

export function isUazapi(instance: { api_provider?: string }): boolean {
  return instance.api_provider === 'uazapi';
}

export function isEvolution(instance: { api_provider?: string }): boolean {
  return !instance.api_provider || instance.api_provider === 'evolution';
}

/**
 * Get the provider implementation for an instance.
 * Returns the appropriate provider object based on api_provider field.
 */
export function getProvider(config: ProviderConfig) {
  if (config.provider === 'uazapi') {
    return UazapiProvider;
  }
  return EvolutionProvider;
}

/**
 * High-level send text function that resolves the provider automatically.
 */
export async function sendText(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
  opts: SendTextOptions,
): Promise<SendTextResult> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.sendText(config, opts);
}

/**
 * High-level send media function that resolves the provider automatically.
 */
export async function sendMedia(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
  opts: SendMediaOptions,
): Promise<SendMediaResult> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.sendMedia(config, opts);
}

/**
 * High-level connect function that resolves the provider automatically.
 */
export async function connectInstance(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
): Promise<ConnectResult> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.connect(config);
}

/**
 * High-level get status function that resolves the provider automatically.
 */
export async function getInstanceStatus(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
): Promise<StatusResult> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.getStatus(config);
}

/**
 * Configure webhook for an instance.
 */
export async function configureWebhook(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
  webhookConfig: WebhookConfig,
): Promise<void> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.configureWebhook(config, webhookConfig);
}

/**
 * Disconnect an instance (logout without deleting).
 */
export async function disconnectInstance(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
): Promise<void> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.disconnect(config);
}

/**
 * Delete an instance from the WhatsApp provider.
 */
export async function deleteProviderInstance(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
): Promise<void> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.deleteInstance(config);
}

/**
 * Create a new instance on the WhatsApp provider.
 */
export async function createProviderInstance(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
  webhookUrl: string,
): Promise<ConnectResult> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.createInstance(config, webhookUrl);
}

/**
 * Delete a message for everyone.
 */
export async function deleteMessage(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
  remoteJid: string,
  messageId: string,
  isFromMe: boolean,
): Promise<void> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.deleteMessage(config, remoteJid, messageId, isFromMe);
}

/**
 * Send emoji reaction to a message.
 */
export async function sendReaction(
  instance: { api_provider?: string; api_url: string; api_key: string | null; instance_name: string },
  remoteJid: string,
  messageId: string,
  reaction: string,
  isFromMe: boolean,
): Promise<void> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  return provider.sendReaction(config, remoteJid, messageId, reaction, isFromMe);
}
