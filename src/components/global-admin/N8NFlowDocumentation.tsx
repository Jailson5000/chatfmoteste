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
  Volume2,
  Database,
  Brain
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const EXAMPLE_PAYLOAD_FULL = `{
  "event": "new_message",
  "conversation_id": "uuid-da-conversa",
  "session_id": "miauchat_uuid-da-conversa",
  "message": "Quero agendar uma consulta",
  "message_type": "text",
  "original_message_type": "audio",
  "is_audio_transcription": true,
  
  "client": {
    "id": "uuid-do-cliente",
    "name": "João Silva",
    "phone": "+5511999999999",
    "email": "joao@email.com",
    "notes": "Cliente VIP",
    "document": "123.456.789-00",
    "memories": [
      { "fact_type": "preference", "content": "Prefere atendimento pela manhã", "importance": 8 }
    ]
  },
  
  "automation": {
    "id": "uuid-da-automacao",
    "name": "Advogado Virtual",
    "prompt": "Você é um advogado especialista...",
    "temperature": 0.7,
    "voice_enabled": true,
    "voice_id": "EXAVITQu4vr4xnSDxMaL"
  },
  
  "conversation_history": [
    { "role": "user", "content": "Olá", "type": "text", "timestamp": "..." },
    { "role": "assistant", "content": "Olá! Como posso ajudar?", "type": "text", "timestamp": "..." }
  ],
  
  "knowledge_base": [
    { "title": "Horários de Atendimento", "content": "Segunda a Sexta, 9h às 18h", "category": "info" }
  ],
  
  "context": {
    "law_firm_id": "uuid-da-empresa",
    "whatsapp_instance_id": "uuid-instancia",
    "remote_jid": "5511999999999@s.whatsapp.net",
    "timestamp": "2026-01-21T10:30:00Z"
  }
}`;

const EXAMPLE_RESPONSE = `{
  "response": "Perfeito João! Vou agendar sua consulta.",
  "action": "send_text"
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
          <p className="font-medium text-white text-sm">Fluxo de Processamento Completo</p>
        </div>
        
        <div className="flex items-center justify-between gap-2 overflow-x-auto py-2">
          {/* Step 1: Message */}
          <div className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <MessageSquare className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-[9px] text-white/60 text-center">Cliente</span>
          </div>
          
          <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
          
          {/* Step 2: Transcription */}
          <div className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <Mic className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-[9px] text-white/60 text-center">STT</span>
          </div>
          
          <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
          
          {/* Step 3: Context */}
          <div className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
              <Database className="h-4 w-4 text-cyan-400" />
            </div>
            <span className="text-[9px] text-white/60 text-center">Contexto</span>
          </div>
          
          <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
          
          {/* Step 4: N8N */}
          <div className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30 ring-2 ring-orange-500/50">
              <Workflow className="h-4 w-4 text-orange-400" />
            </div>
            <span className="text-[9px] text-white/60 text-center font-medium">n8n</span>
          </div>
          
          <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
          
          {/* Step 5: TTS */}
          <div className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
              <Volume2 className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-[9px] text-white/60 text-center">TTS*</span>
          </div>
          
          <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
          
          {/* Step 6: Response */}
          <div className="flex flex-col items-center gap-1 min-w-[60px]">
            <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            </div>
            <span className="text-[9px] text-white/60 text-center">WhatsApp</span>
          </div>
        </div>
      </div>

      {/* What we send */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-white font-medium">Memórias do Cliente</span>
          </div>
          <p className="text-[10px] text-white/50">
            Fatos importantes extraídos de conversas anteriores
          </p>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-white font-medium">Base de Conhecimento</span>
          </div>
          <p className="text-[10px] text-white/50">
            Itens vinculados ao agente no MiauChat
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
        <div className="text-xs text-emerald-200/80 space-y-1">
          <p className="font-medium">✅ Payload Completo para N8N:</p>
          <ul className="text-[10px] space-y-0.5 pl-2">
            <li>• <code className="text-orange-400">session_id</code> - Para nodes de memória</li>
            <li>• <code className="text-purple-400">conversation_history</code> - Últimas 20 mensagens</li>
            <li>• <code className="text-cyan-400">knowledge_base</code> - Base de conhecimento do agente</li>
            <li>• <code className="text-blue-400">client.memories</code> - Fatos aprendidos do cliente</li>
            <li>• <code className="text-emerald-400">automation.prompt</code> - Prompt completo do agente</li>
          </ul>
        </div>
      </div>

      {/* Warning about HTTP node */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
        <div className="text-xs text-yellow-200/80">
          <p className="font-medium mb-1">⚠️ Importante: Não use HTTP Request para WhatsApp</p>
          <p className="text-[10px]">
            O MiauChat já envia a resposta para o WhatsApp automaticamente.
            Seu workflow deve apenas retornar <code className="text-green-400">{`{ "response": "...", "action": "send_text" }`}</code>
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
            <span className="text-sm">Ver payload completo</span>
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
                <span className="text-xs text-white/70">Payload completo enviado ao webhook</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-white/50 hover:text-white"
                onClick={() => copyToClipboard(EXAMPLE_PAYLOAD_FULL, setPayloadCopied)}
              >
                {payloadCopied ? (
                  <Check className="h-3 w-3 mr-1 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                Copiar
              </Button>
            </div>
            <pre className="p-3 rounded-lg bg-black/50 border border-white/10 text-[9px] text-white/80 overflow-x-auto max-h-64">
              {EXAMPLE_PAYLOAD_FULL}
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

          {/* Mapping to N8N nodes */}
          <div className="space-y-2">
            <span className="text-xs text-white/70 font-medium">🔗 Mapeamento para seus nodes N8N</span>
            <div className="grid gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                <span className="text-orange-400 font-mono">InputsessionId</span>
                <span className="text-white/30">→</span>
                <code className="text-blue-400">session_id</code>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                <span className="text-orange-400 font-mono">memoria1</span>
                <span className="text-white/30">→</span>
                <code className="text-purple-400">client.memories</code> + <code className="text-cyan-400">conversation_history</code>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                <span className="text-orange-400 font-mono">base de conhecimento</span>
                <span className="text-white/30">→</span>
                <code className="text-emerald-400">knowledge_base</code>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                <span className="text-orange-400 font-mono">Advogado IA1</span>
                <span className="text-white/30">→</span>
                <code className="text-yellow-400">automation.prompt</code>
              </div>
            </div>
          </div>

          {/* Actions Table */}
          <div className="space-y-2">
            <span className="text-xs text-white/70">Ações disponíveis na resposta</span>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-green-400">"send_text"</code>
                <p className="text-white/50 mt-1">Envia resposta (texto ou áudio se voice_enabled)</p>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <code className="text-yellow-400">"none"</code>
                <p className="text-white/50 mt-1">Não envia resposta automática</p>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
