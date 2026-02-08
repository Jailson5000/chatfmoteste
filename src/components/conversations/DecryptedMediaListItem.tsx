import { useMemo, useState } from "react";
import { FileText, Loader2, Music } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMediaDecrypt } from "@/hooks/useMediaDecrypt";
import { cn } from "@/lib/utils";

type MediaKind = "audio" | "document";

interface DecryptedMediaListItemProps {
  kind: MediaKind;
  mediaUrl: string | null;
  mimeType: string | null;
  whatsappMessageId: string | null;
  conversationId: string;
  content?: string | null;
  createdAt: string;
}

function normalizeMime(mimeType: string | null | undefined): string {
  const raw = (mimeType || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.split(";")[0].trim();
}

function isEncryptedMediaUrl(url: string): boolean {
  return url.includes(".enc") || url.includes("mmg.whatsapp.net");
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function extensionFromMime(mimeType: string, kind: MediaKind): string {
  if (!mimeType) return kind === "audio" ? ".ogg" : ".pdf";

  if (mimeType.startsWith("audio/")) {
    if (mimeType.includes("ogg")) return ".ogg";
    if (mimeType.includes("mpeg")) return ".mp3";
    if (mimeType.includes("wav")) return ".wav";
    if (mimeType.includes("mp4")) return ".m4a";
    return ".ogg";
  }

  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType.includes("word") || mimeType.includes("msword")) return ".docx";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return ".xlsx";

  return ".pdf";
}

function looksLikeFileName(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v || v.length > 180 || v.includes("\n")) return false;
  return /\.[A-Za-z0-9]{2,6}$/.test(v);
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header?.match(/data:([^;]+)/);
  const mime = mimeMatch?.[1] || "application/octet-stream";

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function DecryptedMediaListItem({
  kind,
  mediaUrl,
  mimeType,
  whatsappMessageId,
  conversationId,
  content,
  createdAt,
}: DecryptedMediaListItemProps) {
  const { getDecryptedMedia, isLoading } = useMediaDecrypt();
  const [error, setError] = useState(false);

  const normalizedMime = useMemo(() => normalizeMime(mimeType), [mimeType]);

  const needsDecryption = useMemo(() => {
    // If we have a valid storage URL (not encrypted WhatsApp URL), use it directly
    if (mediaUrl && !isEncryptedMediaUrl(mediaUrl)) {
      return false;
    }
    // For encrypted WhatsApp media, use decryption proxy
    return !!whatsappMessageId;
  }, [whatsappMessageId, mediaUrl]);

  const typeLabel = useMemo(() => {
    if (normalizedMime) return normalizedMime.split("/")[1]?.toUpperCase() || (kind === "audio" ? "ÁUDIO" : "DOC");
    return kind === "audio" ? "ÁUDIO" : "DOC";
  }, [normalizedMime, kind]);

  const fileName = useMemo(() => {
    const ext = extensionFromMime(normalizedMime, kind);

    if (looksLikeFileName(content)) {
      const safe = sanitizeFileName(content!.trim());
      return safe.toLowerCase().endsWith(ext) ? safe : `${safe}${ext}`;
    }

    const base = kind === "audio" ? "Audio" : "Documento";
    return `${base}${ext}`;
  }, [content, kind, normalizedMime]);

  const handleClick = async () => {
    setError(false);

    // If we have a normal URL, open it directly
    if (!needsDecryption) {
      if (mediaUrl) window.open(mediaUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // If can't decrypt (missing message id), do nothing
    if (!whatsappMessageId) {
      if (mediaUrl) window.open(mediaUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const dataUrl = await getDecryptedMedia(
      conversationId,
      whatsappMessageId,
      normalizedMime || (kind === "audio" ? "audio/ogg" : "application/pdf"),
    );

    if (!dataUrl) {
      setError(true);
      return;
    }

    downloadDataUrl(dataUrl, fileName);
  };

  const loading = whatsappMessageId ? isLoading(whatsappMessageId) : false;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading && needsDecryption}
      className={cn(
        "w-full flex items-center gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-left",
        error && "ring-1 ring-destructive/30",
      )}
      aria-label={kind === "audio" ? "Baixar áudio" : "Baixar documento"}
    >
      {kind === "audio" ? (
        <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{typeLabel}</p>
        <p className={cn("text-[10px] text-muted-foreground", error && "text-destructive")}
        >
          {error ? "Falha ao baixar" : formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: ptBR })}
        </p>
      </div>

      {loading && needsDecryption && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </button>
  );
}
