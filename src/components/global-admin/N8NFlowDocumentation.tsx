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
  AlertTriangle,
  Mic,
  Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const EXAMPLE_PAYLOAD_TEXT = `{
  "event": "new_message",
  "conversation_id": "uuid-da-conversa",
  "message": "Olá, preciso de ajuda",
  "message_type": "text",
  "original_message_type": "text",
  "is_audio_transcription": false,
  "client": {
    "id": "uuid-do-cliente",
    "name": "João Silva",
    "phone": "+5511999999999"
  },
  "automation": {
    "id": "uuid-da-automacao",
    "name": "Atendimento Principal",
    "prompt": "Você é um assistente...",
    "voice_enabled": true,
    "voice_id": "EXAVITQu4vr4xnSDxMaL"
  },
  "context": {
    "law_firm_id": "uuid-da-empresa",
    "whatsapp_instance_id": "uuid-instancia",
    "remote_jid": "5511999999999@s.whatsapp.net",
    "timestamp": "2026-01-21T10:30:00Z"
  }
}`;

const EXAMPLE_PAYLOAD_AUDIO = `{
  "event": "new_message",
  "conversation_id": "uuid-da-conversa",
  "message": "Quero agendar uma consulta para amanhã",
  "message_type": "text",
  "original_message_type": "audio",
  "is_audio_transcription": true,
  "raw_message": "[Áudio transcrito]: Quero agendar...",
  "client": { ... },
  "automation": { ... }
}`;

const EXAMPLE_RESPONSE = `{
  "response": "Olá João! Como posso ajudá-lo hoje?",
  "action": "send_text"
}`;

const EXAMPLE_RESPONSE_AUDIO = `{
  "response": "Perfeito! Vou agendar para amanhã.",
  "action": "send_text"
}
// Se voice_enabled=true na automação, 
// a resposta será convertida em áudio automaticamente`;

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
          
          {/* Step 2: MiauChat (Transcription) */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <Mic className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center">Transcrição</span>
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
          
          {/* Step 4: TTS (if enabled) */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
              <Volume2 className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center">TTS*</span>
          </div>
          
          <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
          
          {/* Step 5: Response */}
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-[10px] text-white/60 text-center">Resposta</span>
          </div>
        </div>
        
        <p className="text-[10px] text-white/40 mt-2">
          * TTS (Text-to-Speech) é ativado automaticamente se <code className="text-emerald-400">voice_enabled=true</code> na automação
        </p>
      </div>

      {/* Audio Info Box */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <Mic className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
        <div className="text-xs text-purple-200/80 space-y-1">
          <p className="font-medium">Áudios são transcritos automaticamente!</p>
          <p>
            Quando o cliente envia um áudio, ele é transcrito pelo sistema antes de chegar ao N8N.
            O campo <code className="text-orange-400">is_audio_transcription</code> indica se era áudio.
          </p>
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
            Se <code className="text-emerald-400">voice_enabled</code> estiver ativo na automação, 
            a resposta de texto do N8N será automaticamente convertida em áudio via ElevenLabs.
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
          {/* Payload Example - Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-orange-400 border-orange-400/30 bg-orange-400/10 text-[10px]">
                  POST
                </Badge>
                <span className="text-xs text-white/70">Payload - Mensagem de texto</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-white/50 hover:text-white"
                onClick={() => copyToClipboard(EXAMPLE_PAYLOAD_TEXT, setPayloadCopied)}
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
              {EXAMPLE_PAYLOAD_TEXT}
            </pre>
          </div>

          {/* Payload Example - Audio */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-purple-400 border-purple-400/30 bg-purple-400/10 text-[10px]">
                AUDIO
              </Badge>
              <span className="text-xs text-white/70">Payload - Áudio transcrito</span>
            </div>
            <pre className="p-3 rounded-lg bg-black/50 border border-white/10 text-[10px] text-white/80 overflow-x-auto">
              {EXAMPLE_PAYLOAD_AUDIO}
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
              {EXAMPLE_RESPONSE_AUDIO}
            </pre>
          </div>

          {/* Fields Table */}
          <div className="space-y-2">
            <span className="text-xs text-white/70 font-medium">Campos importantes do payload</span>
            <div className="grid gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-orange-400">message</code>
                <p className="text-white/50 mt-1">Texto limpo (sem prefixo [Áudio transcrito])</p>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-purple-400">is_audio_transcription</code>
                <p className="text-white/50 mt-1">true se a mensagem original era áudio</p>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-blue-400">original_message_type</code>
                <p className="text-white/50 mt-1">Tipo original: "audio", "text", "image", etc.</p>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-emerald-400">automation.voice_enabled</code>
                <p className="text-white/50 mt-1">Se true, resposta será convertida em áudio</p>
              </div>
            </div>
          </div>

          {/* Actions Table */}
          <div className="space-y-2">
            <span className="text-xs text-white/70">Ações disponíveis</span>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-green-400">"send_text"</code>
                <p className="text-white/50 mt-1">Envia o texto (ou áudio se voice_enabled)</p>
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
                automaticamente usa a IA interna como fallback (Gemini/GPT conforme plano).
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="space-y-2">
            <span className="text-xs text-white/70 font-medium">💡 Dicas</span>
            <ul className="text-[10px] text-white/60 space-y-1.5 pl-4">
              <li className="list-disc">Use <code className="text-purple-400">is_audio_transcription</code> para saber se era áudio</li>
              <li className="list-disc">O campo <code className="text-orange-400">message</code> já vem limpo (sem prefixo)</li>
              <li className="list-disc">Se <code className="text-emerald-400">voice_enabled=true</code>, seu texto será convertido em áudio</li>
              <li className="list-disc">Use <code className="text-blue-400">automation.prompt</code> para contexto do agente</li>
              <li className="list-disc">Retorne <code className="text-yellow-400">"action": "none"</code> para processar silenciosamente</li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
