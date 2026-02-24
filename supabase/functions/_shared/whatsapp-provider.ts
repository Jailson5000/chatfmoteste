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
  ptt?: boolean;  // For audio: send as push-to-talk voice note
}

export interface SendAudioOptions {
  number: string;
  audioBase64: string;
  mimeType?: string;
}

export interface SendContactOptions {
  number: string;
  fullName: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
  url?: string;
}

export interface FetchProfilePictureResult {
  profilePicUrl: string | null;
  raw?: unknown;
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

  async sendAudio(config: ProviderConfig, opts: SendAudioOptions): Promise<SendMediaResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    // Try sendWhatsAppAudio first (PTT voice note)
    const res = await fetchWithTimeout(
      `${apiUrl}/message/sendWhatsAppAudio/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: opts.number,
          audio: opts.audioBase64,
          delay: 500,
        }),
      },
      SEND_TIMEOUT_MS,
    );

    if (!res.ok) {
      // Fallback to sendMedia
      const fallbackRes = await fetchWithTimeout(
        `${apiUrl}/message/sendMedia/${config.instanceName}`,
        {
          method: "POST",
          headers: {
            apikey: config.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: opts.number,
            mediatype: "audio",
            mimetype: opts.mimeType || "audio/ogg;codecs=opus",
            fileName: "audio.ogg",
            media: opts.audioBase64,
          }),
        },
        SEND_TIMEOUT_MS,
      );

      if (!fallbackRes.ok) {
        const text = await fallbackRes.text().catch(() => "");
        throw new Error(`Evolution sendAudio failed (${fallbackRes.status}): ${text.slice(0, 300)}`);
      }

      const data = await fallbackRes.json().catch(() => ({}));
      return { success: true, whatsappMessageId: data?.key?.id || data?.messageId || null, raw: data };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, whatsappMessageId: data?.key?.id || data?.messageId || null, raw: data };
  },

  async fetchProfilePicture(config: ProviderConfig, phoneNumber: string): Promise<FetchProfilePictureResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const res = await fetchWithTimeout(
      `${apiUrl}/chat/fetchProfilePictureUrl/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: phoneNumber }),
      },
    );

    if (!res.ok) {
      return { profilePicUrl: null };
    }

    const data = await res.json().catch(() => ({}));
    const url = data?.profilePictureUrl || data?.picture || data?.url || data?.pictureUrl || data?.profilePicture || null;
    return { profilePicUrl: typeof url === "string" && url.startsWith("http") ? url : null, raw: data };
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
      throw new Error(`Falha ao enviar mensagem (${res.status}): ${text.slice(0, 300)}`);
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
    };

    // uazapi uses 'text' for caption (not 'caption') per /send/media docs
    if (opts.caption) {
      payload.text = opts.caption;
    }

    if (opts.mediaBase64) {
      payload.file = opts.mediaBase64;
      payload.mimetype = opts.mimeType || "application/octet-stream";
    } else if (opts.mediaUrl) {
      payload.file = opts.mediaUrl;
    }

    // uazapi uses 'docName' for document file name (not 'fileName')
    if (opts.fileName) {
      payload.docName = opts.fileName;
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
      throw new Error(`Falha ao enviar mídia (${res.status}): ${text.slice(0, 300)}`);
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
      throw new Error(`Falha ao conectar instância (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));

    console.log("[UazapiProvider] connect response:", JSON.stringify(data).slice(0, 500));

    // uazapi returns QR as base64 directly - check multiple possible fields
    const qrCode = data?.qrcode || data?.base64 || data?.qr ||
                   data?.data?.qrcode || data?.data?.base64 ||
                   data?.image || data?.data?.image ||
                   data?.instance?.qrcode || null;
    const state = data?.instance?.status || data?.status || data?.state ||
                  (data?.connected === true ? "connected" : "unknown");
    
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
    console.log("[UazapiProvider] getStatus raw response:", JSON.stringify(data).slice(0, 500));
    const state = data?.status || data?.state || "unknown";

    let status = "disconnected";
    if (state === "connected" || state === "open") status = "connected";
    else if (state === "connecting" || state === "qr") status = "connecting";

    // Expanded phone extraction — try many possible fields
    let phoneNumber = data?.phone || data?.number || data?.user ||
      data?.me?.user || data?.me?.id?.split("@")[0] ||
      data?.ownerJid?.split("@")[0] || data?.jid?.split("@")[0] || null;

    // Fallback: if connected but no phone, try GET /me endpoint
    if (!phoneNumber && status === "connected") {
      try {
        const meRes = await fetchWithTimeout(`${apiUrl}/me`, {
          method: "GET",
          headers: { token: config.apiKey, "Content-Type": "application/json" },
        }, 8000);
        if (meRes.ok) {
          const meData = await meRes.json().catch(() => ({}));
          console.log("[UazapiProvider] /me fallback response:", JSON.stringify(meData).slice(0, 500));
          phoneNumber = meData?.phone || meData?.number || meData?.user ||
            meData?.me?.user || meData?.me?.id?.split("@")[0] ||
            meData?.jid?.split("@")[0] || meData?.id?.split("@")[0] || null;
        }
      } catch (e) {
        console.log("[UazapiProvider] /me fallback failed (non-fatal):", e);
      }
    }

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
      throw new Error(`Falha ao configurar webhook (${res.status}): ${text.slice(0, 300)}`);
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

  /**
   * Create a new uazapi instance using the 2-step flow:
   * 1. POST /instance/init with admintoken header → returns instance token
   * 2. POST /instance/connect with instance token → returns QR code
   *
   * The config.apiKey here is the ADMIN token.
   * The returned ConnectResult.raw will contain { instanceToken } for the caller to persist.
   */
  async createInstance(config: ProviderConfig, _webhookUrl: string): Promise<ConnectResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    // Step 1: Initialize instance with admin token
    console.log(`[UazapiProvider] Step 1: POST /instance/init with admintoken for "${config.instanceName}"`);
    const initRes = await fetchWithTimeout(
      `${apiUrl}/instance/init`,
      {
        method: "POST",
        headers: {
          admintoken: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: config.instanceName, systemName: "MiauChat" }),
      },
      30000,
    );

    if (!initRes.ok) {
      const text = await initRes.text().catch(() => "");
      throw new Error(`Falha ao criar instância (${initRes.status}): ${text.slice(0, 300)}`);
    }

    const initData = await initRes.json().catch(() => ({}));
    const instanceToken = initData?.token || initData?.data?.token || null;
    console.log(`[UazapiProvider] Step 1 result: token=${instanceToken ? "obtained" : "MISSING"}`);

    if (!instanceToken) {
      throw new Error(`Falha ao criar instância: token não retornado pela API. Resposta: ${JSON.stringify(initData).slice(0, 300)}`);
    }

    // Step 2: Connect using the INSTANCE token (not admin token)
    console.log(`[UazapiProvider] Step 2: POST /instance/connect with instance token`);
    const connectRes = await fetchWithTimeout(
      `${apiUrl}/instance/connect`,
      {
        method: "POST",
        headers: {
          token: instanceToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      30000,
    );

    if (!connectRes.ok) {
      const text = await connectRes.text().catch(() => "");
      throw new Error(`Falha ao conectar instância (${connectRes.status}): ${text.slice(0, 300)}`);
    }

    const connectData = await connectRes.json().catch(() => ({}));

    console.log("[UazapiProvider] Step 2 connect response:", JSON.stringify(connectData).slice(0, 500));

    const qrCode = connectData?.qrcode || connectData?.base64 || connectData?.qr ||
                   connectData?.data?.qrcode || connectData?.data?.base64 ||
                   connectData?.image || connectData?.data?.image ||
                   connectData?.instance?.qrcode || null;
    const state = connectData?.status || connectData?.state || "unknown";

    let status = "awaiting_qr";
    if (state === "connected" || state === "open") status = "connected";
    else if (state === "connecting") status = "connecting";

    return {
      qrCode,
      status,
      raw: { ...connectData, instanceToken },
    };
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

  async sendAudio(config: ProviderConfig, opts: SendAudioOptions): Promise<SendMediaResult> {
    const apiUrl = normalizeUrl(config.apiUrl);

    // Use dedicated /send/audio endpoint for PTT voice notes
    const payload = {
      number: opts.number,
      audio: opts.audioBase64,
      ptt: true,
      mimetype: opts.mimeType || "audio/ogg;codecs=opus",
    };

    const res = await fetchWithTimeout(
      `${apiUrl}/send/audio`,
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
      // Fallback: try /send/media with file field
      console.warn("[UazapiProvider] /send/audio failed, falling back to /send/media");
      return UazapiProvider.sendMedia(config, {
        number: opts.number,
        mediaType: 'audio',
        mediaBase64: opts.audioBase64,
        mimeType: opts.mimeType || 'audio/ogg',
        ptt: true,
      });
    }

    const data = await res.json().catch(() => ({}));
    const whatsappMessageId = data?.key?.id || data?.id || data?.messageId || null;
    return { success: true, whatsappMessageId, raw: data };
  },

  async fetchProfilePicture(config: ProviderConfig, phoneNumber: string): Promise<FetchProfilePictureResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const cleanPhone = phoneNumber.replace(/\D/g, "").split("@")[0];
    
    // Try 1: POST /profile/image with jid parameter
    const jid = `${cleanPhone}@s.whatsapp.net`;
    try {
      const res = await fetchWithTimeout(
        `${apiUrl}/profile/image`,
        {
          method: "POST",
          headers: {
            token: config.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jid }),
        },
      );

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const url = data?.profilePictureUrl || data?.picture || data?.url || data?.imgUrl || data?.image || null;
        if (typeof url === "string" && url.startsWith("http")) {
          return { profilePicUrl: url, raw: data };
        }
      }
    } catch (_e) { /* fallback below */ }

    // Try 2: POST /profile/image with number parameter (alternative uazapi format)
    try {
      const res2 = await fetchWithTimeout(
        `${apiUrl}/profile/image`,
        {
          method: "POST",
          headers: {
            token: config.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ number: cleanPhone }),
        },
      );

      if (res2.ok) {
        const data2 = await res2.json().catch(() => ({}));
        const url2 = data2?.profilePictureUrl || data2?.picture || data2?.url || data2?.imgUrl || data2?.image || null;
        if (typeof url2 === "string" && url2.startsWith("http")) {
          return { profilePicUrl: url2, raw: data2 };
        }
      }
    } catch (_e) { /* fallback below */ }

    // Try 3: GET /profile/image?number={phone} (some uazapi versions)
    try {
      const res3 = await fetchWithTimeout(
        `${apiUrl}/profile/image?number=${cleanPhone}`,
        {
          method: "GET",
          headers: {
            token: config.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (res3.ok) {
        const data3 = await res3.json().catch(() => ({}));
        const url3 = data3?.profilePictureUrl || data3?.picture || data3?.url || data3?.imgUrl || data3?.image || null;
        if (typeof url3 === "string" && url3.startsWith("http")) {
          return { profilePicUrl: url3, raw: data3 };
        }
      }
    } catch (_e) { /* no more fallbacks */ }

    return { profilePicUrl: null };
  },

  async sendContact(config: ProviderConfig, opts: SendContactOptions): Promise<SendTextResult> {
    const apiUrl = normalizeUrl(config.apiUrl);
    const payload = {
      number: opts.number,
      fullName: opts.fullName,
      phoneNumber: opts.phoneNumber,
      organization: opts.organization || "",
      email: opts.email || "",
      url: opts.url || "",
    };

    const res = await fetchWithTimeout(
      `${apiUrl}/send/contact`,
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
      throw new Error(`Falha ao enviar contato (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, whatsappMessageId: data?.key?.id || data?.id || null, raw: data };
  },
};

// ============================================================================
// PUBLIC API - PROVIDER RESOLVER
// ============================================================================

type InstanceRef = { api_provider?: string; api_url: string; api_key: string | null; instance_name: string };

export function getProviderConfig(instance: InstanceRef): ProviderConfig {
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

export function getProvider(config: ProviderConfig) {
  if (config.provider === 'uazapi') {
    return UazapiProvider;
  }
  return EvolutionProvider;
}

export async function sendText(instance: InstanceRef, opts: SendTextOptions): Promise<SendTextResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).sendText(config, opts);
}

export async function sendMedia(instance: InstanceRef, opts: SendMediaOptions): Promise<SendMediaResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).sendMedia(config, opts);
}

export async function sendAudio(instance: InstanceRef, opts: SendAudioOptions): Promise<SendMediaResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).sendAudio(config, opts);
}

export async function fetchProfilePicture(instance: InstanceRef, phoneNumber: string): Promise<FetchProfilePictureResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).fetchProfilePicture(config, phoneNumber);
}

export async function connectInstance(instance: InstanceRef): Promise<ConnectResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).connect(config);
}

export async function getInstanceStatus(instance: InstanceRef): Promise<StatusResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).getStatus(config);
}

export async function configureWebhook(instance: InstanceRef, webhookConfig: WebhookConfig): Promise<void> {
  const config = getProviderConfig(instance);
  return getProvider(config).configureWebhook(config, webhookConfig);
}

export async function disconnectInstance(instance: InstanceRef): Promise<void> {
  const config = getProviderConfig(instance);
  return getProvider(config).disconnect(config);
}

export async function deleteProviderInstance(instance: InstanceRef): Promise<void> {
  const config = getProviderConfig(instance);
  return getProvider(config).deleteInstance(config);
}

export async function createProviderInstance(instance: InstanceRef, webhookUrl: string): Promise<ConnectResult> {
  const config = getProviderConfig(instance);
  return getProvider(config).createInstance(config, webhookUrl);
}

export async function deleteMessage(instance: InstanceRef, remoteJid: string, messageId: string, isFromMe: boolean): Promise<void> {
  const config = getProviderConfig(instance);
  return getProvider(config).deleteMessage(config, remoteJid, messageId, isFromMe);
}

export async function sendReaction(instance: InstanceRef, remoteJid: string, messageId: string, reaction: string, isFromMe: boolean): Promise<void> {
  const config = getProviderConfig(instance);
  return getProvider(config).sendReaction(config, remoteJid, messageId, reaction, isFromMe);
}

export async function sendContact(instance: InstanceRef, opts: SendContactOptions): Promise<SendTextResult> {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  if ('sendContact' in provider) {
    return (provider as any).sendContact(config, opts);
  }
  console.warn(`[WhatsAppProvider] sendContact not supported for provider: ${config.provider}`);
  return { success: false, whatsappMessageId: undefined };
}

export async function archiveChat(instance: InstanceRef, chatId: string, archive: boolean): Promise<void> {
  const config = getProviderConfig(instance);
  if (config.provider === 'uazapi') {
    const apiUrl = normalizeUrl(config.apiUrl);
    await fetchWithTimeout(`${apiUrl}/chat/archive`, {
      method: "POST",
      headers: { token: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, archive }),
    }).catch(() => { /* best effort */ });
  }
  // Evolution API doesn't have a direct archive endpoint
}
