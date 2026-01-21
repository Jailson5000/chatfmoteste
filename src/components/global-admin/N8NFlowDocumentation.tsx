import { useState } from "react";
import { 
  ArrowRight, 
  MessageSquare, 
  Workflow, 
  Bot, 
  CheckCircle2, 
  Copy, 
  Check,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const EXAMPLE_PAYLOAD = `{
  "event": "new_message",
  "conversation_id": "uuid-da-conversa",
  "law_firm_id": "uuid-da-empresa",
  "message": "Olá, preciso de ajuda",
  "message_type": "text",
  "client": {
    "id": "uuid-do-cliente",
    "name": "João Silva",
    "phone": "+5511999999999"
  },
  "automation": {
    "id": "uuid-da-automacao",
    "name": "Atendimento Principal",
    "prompt": "Você é um assistente..."
  },
  "context": {
    "recent_messages": [
      {
        "role": "user",
        "content": "Mensagem anterior"
      }
    ],
    "timestamp": "2026-01-21T10:30:00Z"
  }
}`;

const EXAMPLE_RESPONSE = `{
  "response": "Olá João! Como posso ajudá-lo hoje?",
  "action": "send_text"
}`;

const EXAMPLE_RESPONSE_ADVANCED = `{
  "response": "Entendi! Vou agendar para amanhã às 14h.",
  "action": "send_text",
  "metadata": {
    "intent": "agendamento",
    "confidence": 0.95,
    "tags": ["urgente", "novo-cliente"]
  }
}`;

export function N8NFlowDocumentation() {
  const [payloadCopied, setPayloadCopied] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Visual Flow */}
      <div className="p-4 rounded-lg bg-gradient-to-r from-orange-500/10 via-blue-500/10 to-green-500/10 border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-orange-400" />
          <p className="font-medium text-white text-sm">Fluxo de Processamento</p>
        </div>
        
        <div className="flex items-center justify-between gap-2 overflow-x-auto py-2">
          {/* Step 1: Message */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center">Cliente</span>
          </div>
          
          <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
          
          {/* Step 2: MiauChat */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/30">
              <Bot className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center">MiauChat</span>
          </div>
          
          <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
          
          {/* Step 3: N8N */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30 ring-2 ring-orange-500/50">
              <Workflow className="h-5 w-5 text-orange-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center font-medium">n8n</span>
          </div>
          
          <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
          
          {/* Step 4: Response */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center">Resposta</span>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-200/80 space-y-1">
          <p>
            Quando ativado, o N8N <strong>substitui</strong> o processamento interno de IA (Gemini/GPT).
          </p>
          <p>
            Cada mensagem é enviada para seu webhook, que deve retornar a resposta a ser enviada ao cliente.
          </p>
        </div>
      </div>

      {/* Collapsible Documentation */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between text-white/70 hover:text-white hover:bg-white/5 h-9"
          >
            <span className="text-sm">Ver documentação técnica</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="space-y-4 pt-2">
          {/* Payload Example */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-orange-400 border-orange-400/30 bg-orange-400/10 text-[10px]">
                  POST
                </Badge>
                <span className="text-xs text-white/70">Payload enviado para seu webhook</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-white/50 hover:text-white"
                onClick={() => copyToClipboard(EXAMPLE_PAYLOAD, setPayloadCopied)}
              >
                {payloadCopied ? (
                  <Check className="h-3 w-3 mr-1 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                Copiar
              </Button>
            </div>
            <pre className="p-3 rounded-lg bg-black/50 border border-white/10 text-[10px] text-white/80 overflow-x-auto max-h-48">
              {EXAMPLE_PAYLOAD}
            </pre>
          </div>

          {/* Response Example */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10 text-[10px]">
                  RESPONSE
                </Badge>
                <span className="text-xs text-white/70">Resposta esperada do webhook</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-white/50 hover:text-white"
                onClick={() => copyToClipboard(EXAMPLE_RESPONSE, setResponseCopied)}
              >
                {responseCopied ? (
                  <Check className="h-3 w-3 mr-1 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                Copiar
              </Button>
            </div>
            <pre className="p-3 rounded-lg bg-black/50 border border-white/10 text-[10px] text-white/80 overflow-x-auto">
              {EXAMPLE_RESPONSE}
            </pre>
          </div>

          {/* Actions Table */}
          <div className="space-y-2">
            <span className="text-xs text-white/70">Ações disponíveis</span>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-green-400">"send_text"</code>
                <p className="text-white/50 mt-1">Envia o texto como resposta</p>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-yellow-400">"none"</code>
                <p className="text-white/50 mt-1">Não envia resposta automática</p>
              </div>
            </div>
          </div>

          {/* Fallback Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-xs text-yellow-200/80">
              <p className="font-medium mb-1">Fallback Automático</p>
              <p>
                Se o webhook falhar (timeout de 30s ou erro HTTP), o sistema 
                automaticamente usa a IA interna como fallback.
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="space-y-2">
            <span className="text-xs text-white/70 font-medium">💡 Dicas</span>
            <ul className="text-[10px] text-white/60 space-y-1.5 pl-4">
              <li className="list-disc">Use o <code className="text-orange-400">secret</code> no header Authorization como Bearer token</li>
              <li className="list-disc">O <code className="text-blue-400">conversation_id</code> é único por conversa, use para contexto</li>
              <li className="list-disc">O campo <code className="text-green-400">automation.prompt</code> contém o prompt configurado no agente</li>
              <li className="list-disc">Retorne <code className="text-yellow-400">"action": "none"</code> para processar silenciosamente</li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
