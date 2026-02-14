import { FileText, Reply, Link2 } from "lucide-react";

interface TemplateButton {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
}

interface WhatsAppTemplatePreviewProps {
  headerText: string;
  body: string;
  footerText: string;
  buttons: TemplateButton[];
}

export function WhatsAppTemplatePreview({ headerText, body, footerText, buttons }: WhatsAppTemplatePreviewProps) {
  const hasContent = body.trim() || headerText.trim();

  // Highlight {{1}}, {{2}} etc in body
  const renderBody = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, i) =>
      /\{\{\d+\}\}/.test(part) ? (
        <span key={i} className="bg-emerald-200 dark:bg-emerald-700 text-emerald-900 dark:text-emerald-100 px-1 rounded text-xs font-mono">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  if (!hasContent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <FileText className="h-8 w-8 mx-auto opacity-40" />
          <p>Preencha o formulário para ver a pré-visualização</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end justify-center h-full px-4">
      {/* WhatsApp-style bubble */}
      <div className="max-w-[280px] w-full">
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border-l-4 border-emerald-500 shadow-sm overflow-hidden">
          {/* Header */}
          {headerText.trim() && (
            <div className="px-3 pt-3 pb-1">
              <p className="text-sm font-bold text-foreground">{headerText}</p>
            </div>
          )}

          {/* Body */}
          {body.trim() && (
            <div className="px-3 py-2">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {renderBody(body)}
              </p>
            </div>
          )}

          {/* Footer */}
          {footerText.trim() && (
            <div className="px-3 pb-2">
              <p className="text-xs text-muted-foreground italic">{footerText}</p>
            </div>
          )}

          {/* Timestamp */}
          <div className="px-3 pb-2 flex justify-end">
            <span className="text-[10px] text-muted-foreground">12:00</span>
          </div>
        </div>

        {/* Buttons */}
        {buttons.length > 0 && (
          <div className="mt-1 space-y-1">
            {buttons.map((btn, i) => (
              <div
                key={i}
                className="bg-background border rounded-lg px-3 py-2 text-center text-sm text-primary font-medium flex items-center justify-center gap-1.5"
              >
                {btn.type === "QUICK_REPLY" ? (
                  <Reply className="h-3.5 w-3.5" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {btn.text || "Botão"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
