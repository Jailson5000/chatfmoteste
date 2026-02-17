import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation constants
const MAX_MESSAGE_LENGTH = 10000;
const MAX_CONTEXT_STRING_LENGTH = 255;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SOURCES = ['web', 'whatsapp', 'TRAY', 'api', 'WIDGET', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP_CLOUD'];

/**
 * Extract readable text from a PDF base64 string using regex on raw PDF streams.
 * Works for text-based PDFs (not scanned/image-only PDFs).
 */
function extractTextFromPdfBase64(base64: string): string {
  try {
    const binaryStr = atob(base64);
    const textMatches: string[] = [];
    
    // Extract text from PDF text objects: strings between parentheses inside BT..ET blocks
    const regex = /\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(binaryStr)) !== null) {
      const text = match[1];
      // Filter only readable text (ignore binary garbage)
      if (text.length > 1 && /[a-zA-Z0-9À-ú]/.test(text)) {
        textMatches.push(text);
      }
    }
    
    const extractedText = textMatches.join(' ').trim();
    
    if (extractedText.length < 10) {
      return '[Nao foi possivel extrair texto do PDF - pode ser um documento escaneado/imagem]';
    }
    
    // Limit to 3000 chars to avoid overloading the prompt
    return extractedText.substring(0, 3000);
  } catch {
    return '[Erro ao processar conteudo do PDF]';
  }
}
const WIDGET_ID_REGEX = /^widget_[a-zA-Z0-9_-]{10,100}$/;

// Prompt injection detection patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i,
  /disregard\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?|programming)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /forget\s+(all\s+)?(previous|your|everything)/i,
  /new\s+(persona|identity|role|character)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(if\s+)?(you\s+are|a|an)/i,
  /system\s*(message|prompt|override|instruction)/i,
  /\[(system|admin|override|root|sudo)\]/i,
  /repeat\s+(your|the)\s+(instructions?|system\s+prompt|rules?)/i,
  /what\s+(are|is)\s+(your|the)\s+(instructions?|system\s+prompt|rules?)/i,
  /reveal\s+(your|the)\s+(instructions?|prompt|programming)/i,
  /output\s+(your|the)\s+(initial|original|system)\s+(prompt|instructions?)/i,
  /jailbreak/i,
  /DAN\s*mode/i,
  /developer\s*mode/i,
];

// Helper to generate error reference ID for tracking
function generateErrorRef(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Get current billing period in YYYY-MM format
function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Record AI conversation usage for billing - counts unique conversations per billing period
async function recordAIConversationUsage(
  supabaseClient: any,
  lawFirmId: string,
  conversationId: string,
  automationId: string,
  automationName: string,
  source: string
): Promise<boolean> {
  const billingPeriod = getCurrentBillingPeriod();
  
  try {
    // Check if this conversation was already counted this billing period
    const { data: existingRecord } = await supabaseClient
      .from('usage_records')
      .select('id')
      .eq('law_firm_id', lawFirmId)
      .eq('usage_type', 'ai_conversation')
      .eq('billing_period', billingPeriod)
      .filter('metadata->>conversation_id', 'eq', conversationId)
      .limit(1);
    
    if (existingRecord && existingRecord.length > 0) {
      console.log(`[AI Chat] Conversation ${conversationId} already counted this period`);
      return false; // Already counted
    }
    
    // Record the usage - this conversation is being handled by AI for the first time this month
    const { error } = await supabaseClient
      .from('usage_records')
      .insert({
        law_firm_id: lawFirmId,
        usage_type: 'ai_conversation',
        count: 1,
        billing_period: billingPeriod,
        metadata: {
          conversation_id: conversationId,
          automation_id: automationId,
          automation_name: automationName,
          source: source,
          first_ai_response_at: new Date().toISOString(),
        }
      });
    
    if (error) {
      console.error('[AI Chat] Failed to record AI conversation usage:', error);
      return false;
    }
    
    console.log(`[AI Chat] AI usage recorded for conversation ${conversationId}, period ${billingPeriod}`);
    return true;
  } catch (err) {
    console.error('[AI Chat] Error recording AI conversation usage:', err);
    return false;
  }
}

// Helper to validate UUID format
function isValidUUID(str: string | undefined | null): boolean {
  if (!str) return false;
  return UUID_REGEX.test(str);
}

// Helper to check if it's a widget conversation ID
function isWidgetId(str: string | undefined | null): boolean {
  if (!str) return false;
  return WIDGET_ID_REGEX.test(str);
}

// Detect potential prompt injection attempts
function detectPromptInjection(text: string): { detected: boolean; pattern?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { detected: true, pattern: pattern.source };
    }
  }
  return { detected: false };
}

// Sanitize string input (prevent XSS and limit length)
function sanitizeString(str: string | undefined | null, maxLength: number = MAX_CONTEXT_STRING_LENGTH): string {
  if (!str || typeof str !== 'string') return '';
  // Trim and limit length
  return str.trim().slice(0, maxLength);
}

// Wrap user input with delimiters to reduce injection risk
function wrapUserInput(message: string): string {
  return `<user_message>${message}</user_message>`;
}

interface ChatRequest {
  conversationId: string;
  message: string;
  automationId?: string;
  source?: string; // 'web', 'TRAY', 'whatsapp', etc.
  context?: {
    clientName?: string;
    clientPhone?: string;
    currentStatus?: string;
    previousMessages?: Array<{ role: string; content: string }>;
    clientId?: string;
    lawFirmId?: string;
    audioRequested?: boolean;
    widgetKey?: string;
    // Flag to skip saving user message (when called from evolution-webhook where message is already saved)
    skipSaveUserMessage?: boolean;
    // Flag to skip saving AI response (when called from evolution-webhook which saves AFTER sending to WhatsApp)
    skipSaveAIResponse?: boolean;
    // PDF document support - base64 content for multimodal AI processing
    documentBase64?: string;
    documentMimeType?: string;
    documentFileName?: string;
  };
}

// Template sending tool definition
const TEMPLATE_TOOL = {
  type: "function",
  function: {
    name: "send_template",
    description: "Envia um template/mensagem pré-configurada para o cliente. Use quando precisar enviar materiais, guias, imagens, vídeos ou documentos prontos.",
    parameters: {
      type: "object",
      properties: {
        template_name: {
          type: "string",
          description: "Nome ou atalho do template a ser enviado (ex: 'Avaliação', 'Baixar extratos', 'Link Youtube')"
        },
        additional_message: {
          type: "string",
          description: "Mensagem adicional opcional para acompanhar o template (opcional)"
        }
      },
      required: ["template_name"]
    }
  }
};

// CRM/Internal actions tools definition for function calling - base structure
// NOTE: Use getCrmToolsWithContext() to get tools with tenant-specific options injected
const CRM_TOOLS_BASE = {
  transfer_to_department: {
    type: "function",
    function: {
      name: "transfer_to_department",
      description: "Transfere a conversa/cliente para outro departamento da empresa. Use quando o cliente precisa de atendimento especializado de outro setor.",
      parameters: {
        type: "object",
        properties: {
          department_name: {
            type: "string",
            description: "Nome do departamento para transferir"
          },
          reason: {
            type: "string",
            description: "Motivo da transferência (opcional, para registro interno)"
          }
        },
        required: ["department_name"]
      }
    }
  },
  change_status: {
    type: "function",
    function: {
      name: "change_status",
      description: "Altera o status do cliente no funil/CRM. Use para marcar evolução do atendimento.",
      parameters: {
        type: "object",
        properties: {
          status_name: {
            type: "string",
            description: "Nome do novo status"
          },
          reason: {
            type: "string",
            description: "Motivo da mudança de status (opcional)"
          }
        },
        required: ["status_name"]
      }
    }
  },
  add_tag: {
    type: "function",
    function: {
      name: "add_tag",
      description: "Adiciona uma etiqueta/tag EXISTENTE ao cliente para categorização. NÃO crie novas tags.",
      parameters: {
        type: "object",
        properties: {
          tag_name: {
            type: "string",
            description: "Nome da tag a adicionar"
          }
        },
        required: ["tag_name"]
      }
    }
  },
  remove_tag: {
    type: "function",
    function: {
      name: "remove_tag",
      description: "Remove uma etiqueta/tag do cliente.",
      parameters: {
        type: "object",
        properties: {
          tag_name: {
            type: "string",
            description: "Nome da tag a remover"
          }
        },
        required: ["tag_name"]
      }
    }
  },
  transfer_to_responsible: {
    type: "function",
    function: {
      name: "transfer_to_responsible",
      description: "Transfere a conversa para outro responsável (humano ou agente de IA). Use quando o atendimento precisa ser passado para outra pessoa ou IA especializada.",
      parameters: {
        type: "object",
        properties: {
          responsible_type: {
            type: "string",
            enum: ["human", "ai"],
            description: "Tipo do responsável: 'human' para atendente humano, 'ai' para outro agente de IA"
          },
          responsible_name: {
            type: "string",
            description: "Nome do responsável ou agente de IA para transferir"
          },
          reason: {
            type: "string",
            description: "Motivo da transferência (opcional, para registro)"
          }
        },
        required: ["responsible_type", "responsible_name"]
      }
    }
  }
};

// Generate CRM tools with tenant-specific context injected into descriptions
// This helps the AI know exactly which departments/statuses/tags are available
async function getCrmToolsWithContext(supabase: any, lawFirmId: string): Promise<any[]> {
  try {
    // Fetch real options from the tenant's database in parallel
    const [deptResult, statusResult, tagResult, membersResult] = await Promise.all([
      supabase.from("departments").select("name").eq("law_firm_id", lawFirmId).eq("is_active", true),
      supabase.from("custom_statuses").select("name").eq("law_firm_id", lawFirmId).eq("is_active", true),
      supabase.from("tags").select("name").eq("law_firm_id", lawFirmId),
      supabase.from("profiles").select("full_name").eq("law_firm_id", lawFirmId).eq("is_active", true),
    ]);

    const depts = deptResult.data?.map((d: any) => d.name).join(", ") || "nenhum disponível";
    const statuses = statusResult.data?.map((s: any) => s.name).join(", ") || "nenhum disponível";
    const tags = tagResult.data?.map((t: any) => t.name).join(", ") || "nenhuma disponível";
    const members = membersResult.data?.map((m: any) => m.full_name).join(", ") || "nenhum disponível";

    console.log(`[AI Chat] CRM Context - Depts: ${depts.substring(0, 100)}, Statuses: ${statuses.substring(0, 100)}, Tags: ${tags.substring(0, 100)}`);

    // Build tools with injected context
    return [
      {
        type: "function",
        function: {
          name: "transfer_to_department",
          description: `Transfere a conversa para outro departamento. DEPARTAMENTOS DISPONÍVEIS: ${depts}. Use APENAS estes nomes exatos. NÃO transfira se já estiver no departamento correto.`,
          parameters: CRM_TOOLS_BASE.transfer_to_department.function.parameters
        }
      },
      {
        type: "function",
        function: {
          name: "change_status",
          description: `Altera o status do cliente no funil/CRM. STATUS DISPONÍVEIS: ${statuses}. Use APENAS estes nomes exatos. NÃO altere se já estiver no status correto.`,
          parameters: CRM_TOOLS_BASE.change_status.function.parameters
        }
      },
      {
        type: "function",
        function: {
          name: "add_tag",
          description: `Adiciona uma tag EXISTENTE ao cliente. TAGS DISPONÍVEIS: ${tags}. Use APENAS estas tags. NÃO CRIE novas tags - use somente as que existem.`,
          parameters: CRM_TOOLS_BASE.add_tag.function.parameters
        }
      },
      {
        type: "function",
        function: {
          name: "remove_tag",
          description: `Remove uma tag do cliente. TAGS DISPONÍVEIS: ${tags}.`,
          parameters: CRM_TOOLS_BASE.remove_tag.function.parameters
        }
      },
      {
        type: "function",
        function: {
          name: "transfer_to_responsible",
          description: `Transfere para outro responsável. ATENDENTES DISPONÍVEIS: ${members}. Use APENAS estes nomes exatos.`,
          parameters: CRM_TOOLS_BASE.transfer_to_responsible.function.parameters
        }
      }
    ];
  } catch (err) {
    console.error("[AI Chat] Error fetching CRM context, using base tools:", err);
    // Fallback to base tools without context
    return Object.values(CRM_TOOLS_BASE);
  }
}

// Legacy static CRM_TOOLS for backwards compatibility (deprecated - use getCrmToolsWithContext)
const CRM_TOOLS = Object.values(CRM_TOOLS_BASE);

// Scheduling/Appointment tools for intelligent booking
const SCHEDULING_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_services",
      description: "Lista todos os serviços disponíveis para agendamento. REGRAS CRÍTICAS: 1) Chame esta função APENAS UMA VEZ por conversa - se já listou os serviços, NÃO chame novamente, use o service_id que você já obteve. 2) Você DEVE apresentar ABSOLUTAMENTE TODOS os serviços retornados ao cliente, sem omitir nenhum. 3) Use o campo 'services_list_for_response' para copiar a lista formatada. 4) Na confirmação final, mencione apenas o serviço ESCOLHIDO (ex: 'Head Spa'), não liste todos novamente. RETORNA o 'service_id' UUID que DEVE ser usado nas demais funções.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_available_slots",
      description: "Obtém os horários disponíveis para agendamento em uma data específica. IMPORTANTE: Use a data atual fornecida em '### DATA E HORA ATUAIS (Brasília) ###' como referência para calcular datas futuras. Formato de data: YYYY-MM-DD (ex: 2026-02-11). Se o cliente pedir 'quarta-feira' e hoje é quinta-feira 06/02, a próxima quarta-feira é 11/02, não 12/02.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data para verificar disponibilidade no formato YYYY-MM-DD. Calcule corretamente usando a data atual do sistema."
          },
          service_id: {
            type: "string",
            description: "ID do serviço escolhido pelo cliente"
          }
        },
        required: ["date", "service_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Cria um novo agendamento. REGRAS OBRIGATÓRIAS: 1) ANTES de chamar, confirme a data exata com dia da semana E data numérica (ex: 'quarta-feira, 11/02'). 2) Use a data atual de Brasília como referência para calcular dias da semana. 3) NÃO agende sem confirmação explícita do cliente. 4) VERIFIQUE se a data calculada corresponde ao dia da semana solicitado. 5) IMPORTANTE: Você NÃO PRECISA chamar list_services novamente se já listou os serviços anteriormente nesta conversa - use o service_id que você já obteve e tem na memória.",
      parameters: {
        type: "object",
        properties: {
          service_id: {
            type: "string",
            description: "ID do serviço a ser agendado (use o ID que você já obteve quando listou os serviços anteriormente)"
          },
          date: {
            type: "string",
            description: "Data do agendamento no formato YYYY-MM-DD"
          },
          time: {
            type: "string",
            description: "Horário do agendamento no formato HH:MM (ex: 14:00)"
          },
          client_name: {
            type: "string",
            description: "Nome completo do cliente"
          },
          client_phone: {
            type: "string",
            description: "Telefone do cliente"
          },
          client_email: {
            type: "string",
            description: "E-mail do cliente (opcional)"
          },
          notes: {
            type: "string",
            description: "Observações sobre o agendamento (opcional)"
          },
          expected_weekday: {
            type: "string",
            description: "Dia da semana esperado em português (segunda-feira, terça-feira, quarta-feira, quinta-feira, sexta-feira, sábado, domingo). OBRIGATÓRIO para validação de consistência - deve corresponder exatamente à data informada."
          }
        },
        required: ["service_id", "date", "time", "client_name", "client_phone", "expected_weekday"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_client_appointments",
      description: "Lista agendamentos existentes do cliente (para reagendar/cancelar/confirmar). NÃO use para consultar horários livres; para disponibilidade use get_available_slots.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filtrar por status: scheduled, confirmed, all (padrão: all)"
          },
          client_phone: {
            type: "string",
            description: "Telefone do cliente para buscar agendamentos (se não conseguir pelo ID)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reagenda um agendamento existente para nova data/horário. Use quando cliente não pode comparecer e quer remarcar.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description: "ID do agendamento a ser reagendado"
          },
          new_date: {
            type: "string",
            description: "Nova data no formato YYYY-MM-DD"
          },
          new_time: {
            type: "string",
            description: "Novo horário no formato HH:MM (ex: 14:00)"
          }
        },
        required: ["appointment_id", "new_date", "new_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancela um agendamento existente quando cliente não pode comparecer e não quer reagendar",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description: "ID do agendamento a ser cancelado"
          },
          reason: {
            type: "string",
            description: "Motivo do cancelamento"
          }
        },
        required: ["appointment_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "confirm_appointment",
      description: "Confirma presença do cliente em um agendamento quando ele responde 'sim' ou confirma que irá comparecer",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description: "ID do agendamento a ser confirmado"
          }
        },
        required: ["appointment_id"]
      }
    }
  }
];

// Get all available tools (CRM + scheduling + templates)
function getAllAvailableTools(
  includeCrmTools: boolean = true,
  includeSchedulingTools: boolean = false,
  includeTemplateTools: boolean = true
) {
  const tools: any[] = [];
  
  // Add scheduling tools if enabled (for scheduling agents using Agenda Pro)
  if (includeSchedulingTools) {
    tools.push(...SCHEDULING_TOOLS);
  }
  
  // Always include CRM tools (they're tenant-scoped by design)
  if (includeCrmTools) {
    tools.push(...CRM_TOOLS);
  }
  
  // Include template sending tool
  if (includeTemplateTools) {
    tools.push(TEMPLATE_TOOL);
  }
  
  return tools;
}

// Execute CRM/internal action tool call
async function executeCrmTool(
  supabase: any,
  lawFirmId: string,
  conversationId: string,
  clientId: string | undefined,
  automationId: string,
  automationName: string,
  toolCall: { name: string; arguments: string },
  notifyOnTransfer: boolean = false
): Promise<string> {
  try {
    const args = JSON.parse(toolCall.arguments);
    
    console.log(`[AI Chat] Executing CRM tool: ${toolCall.name}`, args, { notifyOnTransfer });
    
    switch (toolCall.name) {
      case "transfer_to_department": {
        // Find department by name (case-insensitive)
        const { data: departments } = await supabase
          .from("departments")
          .select("id, name")
          .eq("law_firm_id", lawFirmId)
          .eq("is_active", true);
        
        const targetDept = departments?.find((d: any) => 
          d.name.toLowerCase().includes(args.department_name.toLowerCase()) ||
          args.department_name.toLowerCase().includes(d.name.toLowerCase())
        );
        
        if (!targetDept) {
          const availableDepts = departments?.map((d: any) => d.name).join(", ") || "nenhum";
          return JSON.stringify({ 
            success: false, 
            error: `Departamento "${args.department_name}" não encontrado. Disponíveis: ${availableDepts}` 
          });
        }
        
        // NEW: Check if conversation is already in this department to avoid redundant transfers
        const { data: currentConv } = await supabase
          .from("conversations")
          .select("department_id")
          .eq("id", conversationId)
          .single();
        
        if (currentConv?.department_id === targetDept.id) {
          console.log(`[AI Chat] Skipping redundant transfer - already in department ${targetDept.name}`);
          return JSON.stringify({ 
            success: true, 
            message: `Conversa já está no departamento "${targetDept.name}". Nenhuma transferência necessária.`,
            already_set: true
          });
        }
        
        // Update conversation and client department
        await supabase
          .from("conversations")
          .update({ department_id: targetDept.id })
          .eq("id", conversationId);
        
        if (clientId) {
          await supabase
            .from("clients")
            .update({ department_id: targetDept.id })
            .eq("id", clientId);
          
          // Log the action
          await supabase
            .from("client_actions")
            .insert({
              client_id: clientId,
              law_firm_id: lawFirmId,
              action_type: "department_change",
              description: `IA ${automationName} transferiu para ${targetDept.name}`,
              to_value: targetDept.name,
              performed_by: null // AI action
            });
        }
        
        // Log AI transfer
        await supabase
          .from("ai_transfer_logs")
          .insert({
            law_firm_id: lawFirmId,
            conversation_id: conversationId,
            from_agent_id: automationId,
            from_agent_name: automationName,
            to_agent_id: targetDept.id,
            to_agent_name: targetDept.name,
            transfer_type: "department",
            reason: args.reason || `Transferência automática para ${targetDept.name}`
          });
        
        // Return success with notification preference
        if (notifyOnTransfer) {
          return JSON.stringify({ 
            success: true, 
            message: `Conversa transferida para o departamento ${targetDept.name}. Por favor, informe ao cliente que ele será atendido por ${targetDept.name}.`,
            notify_client: true
          });
        } else {
          return JSON.stringify({ 
            success: true, 
            message: `[AÇÃO SILENCIOSA EXECUTADA - PROIBIDO MENCIONAR AO CLIENTE] A conversa foi transferida para ${targetDept.name} internamente. INSTRUÇÃO OBRIGATÓRIA: NÃO mencione esta ação, NÃO diga que está transferindo, NÃO fale em departamentos. Continue a conversa como se nada tivesse acontecido ou encerre naturalmente com uma despedida simples.`,
            notify_client: false
          });
        }
      }
      
      case "change_status": {
        if (!clientId) {
          return JSON.stringify({ success: false, error: "Cliente não identificado para alterar status" });
        }
        
        // Find status by name
        const { data: statuses } = await supabase
          .from("custom_statuses")
          .select("id, name")
          .eq("law_firm_id", lawFirmId)
          .eq("is_active", true);
        
        // Priority matching: exact > startsWith > includes (fixes substring false-positive bug)
        // e.g., "DESQUALIFICADO" was matching "Qualificado" because includes() found substring
        let targetStatus = statuses?.find((s: any) => 
          s.name.toLowerCase() === args.status_name.toLowerCase()
        );
        
        if (!targetStatus) {
          targetStatus = statuses?.find((s: any) => 
            s.name.toLowerCase().startsWith(args.status_name.toLowerCase()) ||
            args.status_name.toLowerCase().startsWith(s.name.toLowerCase())
          );
        }
        
        if (!targetStatus) {
          targetStatus = statuses?.find((s: any) => 
            s.name.toLowerCase().includes(args.status_name.toLowerCase()) ||
            args.status_name.toLowerCase().includes(s.name.toLowerCase())
          );
        }
        
        if (!targetStatus) {
          const availableStatuses = statuses?.map((s: any) => s.name).join(", ") || "nenhum";
          return JSON.stringify({ 
            success: false, 
            error: `Status "${args.status_name}" não encontrado. Disponíveis: ${availableStatuses}` 
          });
        }
        
        // Get current status for logging
        const { data: client } = await supabase
          .from("clients")
          .select("custom_status_id, custom_statuses(name)")
          .eq("id", clientId)
          .single();
        
        const fromStatus = (client?.custom_statuses as any)?.name || "Sem status";
        
        // NEW: Check if already in target status to avoid redundant changes
        if (client?.custom_status_id === targetStatus.id) {
          console.log(`[AI Chat] Skipping redundant status change - already in status ${targetStatus.name}`);
          return JSON.stringify({ 
            success: true, 
            message: `Cliente já está no status "${targetStatus.name}". Nenhuma alteração necessária.`,
            already_set: true
          });
        }
        
        // Update client status
        await supabase
          .from("clients")
          .update({ custom_status_id: targetStatus.id })
          .eq("id", clientId);
        
        // Log the action
        await supabase
          .from("client_actions")
          .insert({
            client_id: clientId,
            law_firm_id: lawFirmId,
            action_type: "status_change",
            description: `IA ${automationName} alterou status para ${targetStatus.name}`,
            from_value: fromStatus,
            to_value: targetStatus.name,
            performed_by: null
          });
        
        return JSON.stringify({ 
          success: true, 
          message: `Status do cliente alterado para ${targetStatus.name}` 
        });
      }
      
      case "add_tag": {
        if (!clientId) {
          return JSON.stringify({ success: false, error: "Cliente não identificado para adicionar tag" });
        }
        
        // IMPORTANT: Only find EXISTING tags - do NOT create new ones
        // The AI should only use tags that already exist in the system
        const { data: tag } = await supabase
          .from("tags")
          .select("id, name")
          .eq("law_firm_id", lawFirmId)
          .ilike("name", args.tag_name)
          .maybeSingle();
        
        if (!tag) {
          // List available tags so AI can learn what's available
          const { data: allTags } = await supabase
            .from("tags")
            .select("name")
            .eq("law_firm_id", lawFirmId);
          const availableTags = allTags?.map((t: any) => t.name).join(", ") || "nenhuma";
          
          console.log(`[AI Chat] Tag "${args.tag_name}" not found. Available: ${availableTags}`);
          return JSON.stringify({ 
            success: false, 
            error: `Tag "${args.tag_name}" não existe. Tags disponíveis: ${availableTags}. Você só pode usar tags que já existem no sistema.`
          });
        }
        
        // Check if client already has this tag
        const { data: existingTag } = await supabase
          .from("client_tags")
          .select("id")
          .eq("client_id", clientId)
          .eq("tag_id", tag.id)
          .maybeSingle();
        
        if (existingTag) {
          return JSON.stringify({ 
            success: true, 
            message: `Cliente já possui a tag ${tag.name}`,
            already_set: true
          });
        }
        
        // Add tag to client
        await supabase
          .from("client_tags")
          .insert({
            client_id: clientId,
            tag_id: tag.id
          });
        
        // Log the action
        await supabase
          .from("client_actions")
          .insert({
            client_id: clientId,
            law_firm_id: lawFirmId,
            action_type: "tag_added",
            description: `IA ${automationName} adicionou tag ${tag.name}`,
            to_value: tag.name,
            performed_by: null
          });
        
        return JSON.stringify({ 
          success: true, 
          message: `Tag ${tag.name} adicionada ao cliente` 
        });
      }
      
      case "remove_tag": {
        if (!clientId) {
          return JSON.stringify({ success: false, error: "Cliente não identificado para remover tag" });
        }
        
        // Find tag by name
        const { data: tag } = await supabase
          .from("tags")
          .select("id, name")
          .eq("law_firm_id", lawFirmId)
          .ilike("name", args.tag_name)
          .maybeSingle();
        
        if (!tag) {
          return JSON.stringify({ 
            success: false, 
            error: `Tag "${args.tag_name}" não encontrada` 
          });
        }
        
        // Remove tag from client
        const { error } = await supabase
          .from("client_tags")
          .delete()
          .eq("client_id", clientId)
          .eq("tag_id", tag.id);
        
        if (error) {
          return JSON.stringify({ success: false, error: "Erro ao remover tag" });
        }
        
        // Log the action
        await supabase
          .from("client_actions")
          .insert({
            client_id: clientId,
            law_firm_id: lawFirmId,
            action_type: "tag_removed",
            description: `IA ${automationName} removeu tag ${tag.name}`,
            from_value: tag.name,
            performed_by: null
          });
        
        return JSON.stringify({ 
          success: true, 
          message: `Tag ${tag.name} removida do cliente` 
        });
      }
      
      case "transfer_to_responsible": {
        if (args.responsible_type === "human") {
          // Find team member by name
          const { data: members } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("law_firm_id", lawFirmId)
            .eq("is_active", true);
          
          const targetMember = members?.find((m: any) => 
            m.full_name.toLowerCase().includes(args.responsible_name.toLowerCase()) ||
            args.responsible_name.toLowerCase().includes(m.full_name.toLowerCase())
          );
          
          if (!targetMember) {
            const availableMembers = members?.map((m: any) => m.full_name).join(", ") || "nenhum";
            return JSON.stringify({ 
              success: false, 
              error: `Responsável "${args.responsible_name}" não encontrado. Disponíveis: ${availableMembers}` 
            });
          }
          
          // Update conversation handler to human and assign
          await supabase
            .from("conversations")
            .update({ 
              current_handler: "human",
              assigned_to: targetMember.id,
              current_automation_id: null
            })
            .eq("id", conversationId);
          
          // Log transfer
          await supabase
            .from("ai_transfer_logs")
            .insert({
              law_firm_id: lawFirmId,
              conversation_id: conversationId,
              from_agent_id: automationId,
              from_agent_name: automationName,
              to_agent_id: targetMember.id,
              to_agent_name: targetMember.full_name,
              transfer_type: "human",
              reason: args.reason || `Transferência para ${targetMember.full_name}`
            });
          
          if (notifyOnTransfer) {
            return JSON.stringify({ 
              success: true, 
              message: `Conversa transferida para ${targetMember.full_name}. Informe ao cliente que ${targetMember.full_name} dará continuidade ao atendimento.`,
              notify_client: true
            });
          } else {
            return JSON.stringify({ 
              success: true, 
              message: `[AÇÃO SILENCIOSA EXECUTADA - PROIBIDO MENCIONAR AO CLIENTE] A conversa foi transferida para ${targetMember.full_name} internamente. INSTRUÇÃO OBRIGATÓRIA: NÃO mencione esta ação, NÃO diga que está transferindo, NÃO fale em responsáveis ou atendentes. Continue a conversa como se nada tivesse acontecido ou encerre naturalmente com uma despedida simples.`,
              notify_client: false
            });
          }
        } else if (args.responsible_type === "ai") {
          // Find AI agent by name
          const { data: agents } = await supabase
            .from("automations")
            .select("id, name")
            .eq("law_firm_id", lawFirmId)
            .eq("is_active", true);
          
          const targetAgent = agents?.find((a: any) => 
            a.name.toLowerCase().includes(args.responsible_name.toLowerCase()) ||
            args.responsible_name.toLowerCase().includes(a.name.toLowerCase())
          );
          
          if (!targetAgent) {
            const availableAgents = agents?.map((a: any) => a.name).join(", ") || "nenhum";
            return JSON.stringify({ 
              success: false, 
              error: `Agente IA "${args.responsible_name}" não encontrado. Disponíveis: ${availableAgents}` 
            });
          }
          
          // Update conversation to new AI agent
          await supabase
            .from("conversations")
            .update({ 
              current_handler: "ai",
              current_automation_id: targetAgent.id,
              assigned_to: null
            })
            .eq("id", conversationId);
          
          // Log transfer
          await supabase
            .from("ai_transfer_logs")
            .insert({
              law_firm_id: lawFirmId,
              conversation_id: conversationId,
              from_agent_id: automationId,
              from_agent_name: automationName,
              to_agent_id: targetAgent.id,
              to_agent_name: targetAgent.name,
              transfer_type: "ai",
              reason: args.reason || `Transferência para IA ${targetAgent.name}`
            });
          
          return JSON.stringify({ 
            success: true, 
            message: `[TRANSFERÊNCIA PARA OUTRO AGENTE IA] O agente ${targetAgent.name} irá continuar o atendimento. Você pode encerrar sua resposta aqui.`,
            notify_client: false
          });
        }
        
        return JSON.stringify({ success: false, error: "Tipo de responsável inválido" });
      }
      
      default:
        return JSON.stringify({ success: false, error: `Ferramenta desconhecida: ${toolCall.name}` });
    }
  } catch (error) {
    console.error(`[AI Chat] CRM tool error:`, error);
    return JSON.stringify({ error: "Erro ao executar ação do CRM" });
  }
}

// Execute scheduling tool call for Agenda Pro
async function executeSchedulingTool(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  lawFirmId: string,
  conversationId: string,
  clientId: string | undefined,
  toolCall: { name: string; arguments: string }
): Promise<string> {
  try {
    const args = JSON.parse(toolCall.arguments);
    
    console.log(`[Scheduling] Executing tool: ${toolCall.name}`, args);
    
    // Check if Agenda Pro is enabled for this law firm
    const { data: agendaSettings, error: settingsError } = await supabase
      .from("agenda_pro_settings")
      .select("is_enabled")
      .eq("law_firm_id", lawFirmId)
      .maybeSingle();
    
    if (settingsError || !agendaSettings?.is_enabled) {
      console.log(`[Scheduling] Agenda Pro not enabled for law firm ${lawFirmId}`);
      return JSON.stringify({
        success: false,
        error: "O módulo Agenda Pro não está ativado. Ative-o em Configurações > Integrações."
      });
    }
    
    switch (toolCall.name) {
      case "list_services": {
        // Use Agenda Pro services table
        const { data: services, error } = await supabase
          .from("agenda_pro_services")
          .select("id, name, description, duration_minutes, price, color")
          .eq("law_firm_id", lawFirmId)
          .eq("is_active", true)
          .eq("is_public", true)
          .order("position", { ascending: true });

        if (error) {
          console.error("[Scheduling] Error listing services:", error);
          return JSON.stringify({ success: false, error: "Erro ao buscar serviços" });
        }

        if (!services || services.length === 0) {
          return JSON.stringify({
            success: true,
            message: "Nenhum serviço disponível para agendamento",
            services: []
          });
        }

        const formattedServices = services.map((s: any) => ({
          service_id: s.id,  // Use service_id to emphasize this is the UUID to use
          name: s.name,
          description: s.description || "",
          duration: `${s.duration_minutes} minutos`,
          price: s.price ? `R$ ${s.price.toFixed(2)}` : "Sob consulta"
        }));

        // Pre-formatted list for AI to copy directly - prevents AI from summarizing/omitting
        const servicesListForResponse = formattedServices.map(s => {
          const priceText = s.price !== "Sob consulta" ? ` - ${s.price}` : "";
          const descText = s.description ? ` (${s.description})` : "";
          return `• ${s.name}${descText} - ${s.duration}${priceText}`;
        }).join("\n");

        // Log for debugging
        console.log(`[list_services] Returning ${services.length} services: ${formattedServices.map(s => s.name).join(", ")}`);

        return JSON.stringify({
          success: true,
          total_count: services.length,
          message: `ATENÇÃO: Existem exatamente ${services.length} serviço(s). Você DEVE apresentar TODOS ao cliente, sem omitir nenhum.`,
          instruction: `OBRIGATÓRIO: Apresente cada um dos ${services.length} serviços listados abaixo. NÃO omita nenhum. O cliente deve conhecer TODAS as opções.`,
          services: formattedServices,
          services_list_for_response: servicesListForResponse,
          hint: "Use o campo services_list_for_response para mostrar a lista formatada ao cliente."
        });
      }

      case "get_available_slots": {
        const { date, service_id } = args;
        
        if (!date) {
          return JSON.stringify({ success: false, error: "Data é obrigatória" });
        }

        // Get service duration from Agenda Pro
        let serviceDuration = 60; // Default 60 min
        let serviceName = "Serviço";
        let bufferBefore = 0;
        let bufferAfter = 0;
        
        if (service_id) {
          // Check if service_id is a valid UUID, otherwise search by name (fallback)
          const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id);
          
          let serviceQuery = supabase
            .from("agenda_pro_services")
            .select("id, duration_minutes, buffer_before_minutes, buffer_after_minutes, name")
            .eq("law_firm_id", lawFirmId)
            .eq("is_active", true);
          
          if (isValidUUID) {
            serviceQuery = serviceQuery.eq("id", service_id);
          } else {
            // Fallback: search by name (case-insensitive)
            console.log(`[get_available_slots] service_id "${service_id}" is not a UUID, searching by name`);
            serviceQuery = serviceQuery.ilike("name", service_id);
          }
          
          const { data: service } = await serviceQuery.single();
          
          if (service) {
            serviceDuration = service.duration_minutes;
            serviceName = service.name;
            bufferBefore = service.buffer_before_minutes || 0;
            bufferAfter = service.buffer_after_minutes || 0;
            console.log(`[get_available_slots] Found service: ${service.name} (${service.id}), duration: ${serviceDuration}min`);
          } else {
            console.log(`[get_available_slots] Service not found for identifier: ${service_id}`);
          }
        }
        
        const totalDuration = serviceDuration + bufferBefore + bufferAfter;

        // Get active professionals that offer this service
        const { data: serviceProfessionals } = await supabase
          .from("agenda_pro_service_professionals")
          .select("professional_id")
          .eq("service_id", service_id);
        
        const professionalIds = serviceProfessionals?.map((sp: any) => sp.professional_id) || [];

        if (professionalIds.length === 0) {
          return JSON.stringify({
            success: true,
            message: "Nenhum profissional oferece este serviço no momento",
            available_slots: []
          });
        }

        // VALIDATION: Block past dates - compare in Brazil timezone
        const nowInBrazil = new Date(
          new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
        );
        const todayStr = `${nowInBrazil.getFullYear()}-${String(nowInBrazil.getMonth() + 1).padStart(2, '0')}-${String(nowInBrazil.getDate()).padStart(2, '0')}`;

        if (date < todayStr) {
          console.log(`[get_available_slots] BLOCKED: Requested date ${date} is in the past. Today is ${todayStr}`);
          return JSON.stringify({
            success: false,
            error: `A data ${date} já passou. Hoje é ${todayStr}. Por favor, escolha uma data a partir de hoje.`,
            available_slots: []
          });
        }

        // Get working hours for the requested day (0=Sunday, 1=Monday, etc.)
        const requestedDate = new Date(date + "T12:00:00-03:00");
        const dayOfWeek = requestedDate.getDay();
        
        const dayNames: Record<number, string> = {
          0: "domingo",
          1: "segunda-feira",
          2: "terça-feira",
          3: "quarta-feira",
          4: "quinta-feira",
          5: "sexta-feira",
          6: "sábado"
        };
        
        console.log(`[get_available_slots] Date ${date} is a ${dayNames[dayOfWeek]} (dayOfWeek=${dayOfWeek}). Today: ${todayStr}`);

        // Get business settings to respect business hours
        const { data: businessSettings } = await supabase
          .from("agenda_pro_settings")
          .select("default_start_time, default_end_time, respect_business_hours, saturday_enabled, saturday_start_time, saturday_end_time, sunday_enabled, sunday_start_time, sunday_end_time")
          .eq("law_firm_id", lawFirmId)
          .maybeSingle();

        // Check if day is enabled based on settings
        if (dayOfWeek === 0 && (!businessSettings?.sunday_enabled)) {
          return JSON.stringify({
            success: true,
            message: `Não atendemos aos domingos.`,
            available_slots: []
          });
        }
        if (dayOfWeek === 6 && (!businessSettings?.saturday_enabled)) {
          return JSON.stringify({
            success: true,
            message: `Não atendemos aos sábados.`,
            available_slots: []
          });
        }

        // Determine effective business hours for this day
        let effectiveStartTime = "08:00:00";
        let effectiveEndTime = "18:00:00";

        if (businessSettings?.respect_business_hours) {
          if (dayOfWeek === 6) {
            effectiveStartTime = businessSettings.saturday_start_time || "08:00:00";
            effectiveEndTime = businessSettings.saturday_end_time || "12:00:00";
          } else if (dayOfWeek === 0) {
            effectiveStartTime = businessSettings.sunday_start_time || "08:00:00";
            effectiveEndTime = businessSettings.sunday_end_time || "12:00:00";
          } else {
            effectiveStartTime = businessSettings.default_start_time || "08:00:00";
            effectiveEndTime = businessSettings.default_end_time || "18:00:00";
          }
        }

        // Get working hours for professionals on this day
        const { data: workingHours } = await supabase
          .from("agenda_pro_working_hours")
          .select("professional_id, start_time, end_time, is_enabled")
          .in("professional_id", professionalIds)
          .eq("day_of_week", dayOfWeek)
          .eq("is_enabled", true);

        if (!workingHours || workingHours.length === 0) {
          return JSON.stringify({
            success: true,
            message: `Não há atendimento disponível neste dia (${dayNames[dayOfWeek]})`,
            available_slots: []
          });
        }

        // Collect all unique time slots across professionals
        const allSlots = new Set<string>();
        
        for (const wh of workingHours) {
          // Apply business hours filter if respect_business_hours is enabled
          let whStartTime = wh.start_time;
          let whEndTime = wh.end_time;
          
          if (businessSettings?.respect_business_hours) {
            // Use the later of professional start or business start
            if (whStartTime < effectiveStartTime) {
              whStartTime = effectiveStartTime;
            }
            // Use the earlier of professional end or business end
            if (whEndTime > effectiveEndTime) {
              whEndTime = effectiveEndTime;
            }
            // Skip if no valid range after applying business hours
            if (whStartTime >= whEndTime) {
              continue;
            }
          }
          
          const startParts = whStartTime.split(":");
          const endParts = whEndTime.split(":");
          const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
          const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
          
          let currentMinutes = startMinutes;
          while (currentMinutes + totalDuration <= endMinutes) {
            const hour = Math.floor(currentMinutes / 60);
            const min = currentMinutes % 60;
            allSlots.add(`${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
            currentMinutes += 15; // 15 minute intervals for Agenda Pro
          }
        }

        // Get existing Agenda Pro appointments for this date
        const startOfDay = new Date(date + "T00:00:00.000-03:00");
        const endOfDay = new Date(date + "T23:59:59.999-03:00");

        const { data: existingAppointments } = await supabase
          .from("agenda_pro_appointments")
          .select("start_time, end_time, professional_id")
          .eq("law_firm_id", lawFirmId)
          .gte("start_time", startOfDay.toISOString())
          .lte("start_time", endOfDay.toISOString())
          .not("status", "in", "(cancelled,no_show)");

        // Filter available slots (must have at least one professional available)
        const slotsArray = Array.from(allSlots).sort();
        const availableSlots = slotsArray.filter((slot) => {
          const slotStart = new Date(`${date}T${slot}:00.000-03:00`);
          const slotEnd = new Date(slotStart.getTime() + totalDuration * 60000);

          // Check if any professional is available at this time
          const professionalAvailable = workingHours.some((wh: any) => {
            // Check if slot is within this professional's hours
            const whStart = new Date(`${date}T${wh.start_time}:00.000-03:00`);
            const whEnd = new Date(`${date}T${wh.end_time}:00.000-03:00`);
            if (slotStart < whStart || slotEnd > whEnd) return false;
            
            // Check if this professional is busy
            const professionalBusy = existingAppointments?.some((apt: any) => {
              if (apt.professional_id !== wh.professional_id) return false;
              const aptStart = new Date(apt.start_time);
              const aptEnd = new Date(apt.end_time);
              return slotStart < aptEnd && slotEnd > aptStart;
            });
            
            return !professionalBusy;
          });

          return professionalAvailable;
        });

        if (availableSlots.length === 0) {
          return JSON.stringify({
            success: true,
            message: `Não há horários disponíveis em ${dayNames[dayOfWeek]}, ${date}. Tente outra data.`,
            available_slots: []
          });
        }

        // Group by period for better readability
        const morning = availableSlots.filter(s => parseInt(s.split(":")[0]) < 12);
        const afternoon = availableSlots.filter(s => {
          const hour = parseInt(s.split(":")[0]);
          return hour >= 12 && hour < 18;
        });
        const evening = availableSlots.filter(s => parseInt(s.split(":")[0]) >= 18);

        let summary = `📅 Horários disponíveis para ${dayNames[dayOfWeek]}, ${date}:\n`;
        if (morning.length > 0) {
          summary += `• Manhã: ${morning[0]} até ${morning[morning.length - 1]} (${morning.length} horários)\n`;
        }
        if (afternoon.length > 0) {
          summary += `• Tarde: ${afternoon[0]} até ${afternoon[afternoon.length - 1]} (${afternoon.length} horários)\n`;
        }
        if (evening.length > 0) {
          summary += `• Noite: ${evening[0]} até ${evening[evening.length - 1]} (${evening.length} horários)`;
        }

        return JSON.stringify({
          success: true,
          message: summary,
          service_name: serviceName,
          duration_minutes: serviceDuration,
          available_slots_summary: {
            morning: morning.length > 0 ? `${morning[0]} - ${morning[morning.length - 1]}` : null,
            afternoon: afternoon.length > 0 ? `${afternoon[0]} - ${afternoon[afternoon.length - 1]}` : null,
            evening: evening.length > 0 ? `${evening[0]} - ${evening[evening.length - 1]}` : null,
            total: availableSlots.length
          },
          available_slots: availableSlots.length <= 10 ? availableSlots : undefined,
          hint: availableSlots.length > 10 
            ? "Há muitos horários. Pergunte em qual período o cliente prefere (manhã/tarde) para sugerir opções específicas."
            : "Apresente os horários disponíveis."
        });
      }

      case "book_appointment": {
        const { service_id, date, time, client_name, client_phone, client_email, notes } = args;

        if (!service_id || !date || !time || !client_name || !client_phone) {
          return JSON.stringify({ 
            success: false, 
            error: "Dados incompletos. Necessário: serviço, data, horário, nome e telefone do cliente." 
          });
        }

        // Get service details from Agenda Pro (including pre_message fields)
        // Check if service_id is a valid UUID, otherwise search by name (fallback)
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id);
        
        let serviceQuery = supabase
          .from("agenda_pro_services")
          .select("id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price, pre_message_enabled, pre_message_hours_before, pre_message_text")
          .eq("law_firm_id", lawFirmId)
          .eq("is_active", true);
        
        if (isValidUUID) {
          serviceQuery = serviceQuery.eq("id", service_id);
        } else {
          // Fallback: search by name (case-insensitive)
          console.log(`[book_appointment] service_id "${service_id}" is not a UUID, searching by name`);
          serviceQuery = serviceQuery.ilike("name", service_id);
        }
        
        const { data: service, error: serviceError } = await serviceQuery.single();

        if (serviceError || !service) {
          console.log(`[book_appointment] Service not found for identifier: ${service_id}. Error:`, serviceError);
          return JSON.stringify({ success: false, error: `Serviço "${service_id}" não encontrado. Por favor, use list_services para ver os serviços disponíveis.` });
        }
        
        console.log(`[book_appointment] Found service: ${service.name} (${service.id})`);
        
        // IMPORTANT: Use the actual service ID from the database for subsequent queries
        const resolvedServiceId = service.id;

        // Parse date and time - IMPORTANT: time is in Brazil local time (UTC-3)
        const startTime = new Date(`${date}T${time}:00.000-03:00`);
        const totalDuration = service.duration_minutes + 
          (service.buffer_before_minutes || 0) + 
          (service.buffer_after_minutes || 0);
        const endTime = new Date(startTime.getTime() + totalDuration * 60000);
        
        // VALIDATION: Block booking in the past
        const nowInBrazil = new Date(
          new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
        );
        
        if (startTime < nowInBrazil) {
          console.log(`[book_appointment] BLOCKED: Requested time ${date}T${time} is in the past. Now: ${nowInBrazil.toISOString()}`);
          return JSON.stringify({
            success: false,
            error: "Não é possível agendar para uma data/horário que já passou. Por favor, escolha um horário futuro."
          });
        }
        
        // Calculate and log the day of week for debugging/confirmation
        const dayOfWeekBooking = startTime.getDay();
        const dayNamesBooking: Record<number, string> = {
          0: "domingo",
          1: "segunda-feira",
          2: "terça-feira",
          3: "quarta-feira",
          4: "quinta-feira",
          5: "sexta-feira",
          6: "sábado"
        };
        const calculatedDayName = dayNamesBooking[dayOfWeekBooking];
        
        console.log(`[book_appointment] Booking at ${time} Brazil time = ${startTime.toISOString()} UTC`);
        console.log(`[book_appointment] Date ${date} at ${time} corresponds to ${calculatedDayName} (dayOfWeek=${dayOfWeekBooking})`);
        
        // VALIDATION: Check weekday consistency if expected_weekday is provided
        if (args.expected_weekday) {
          const normalizedExpected = args.expected_weekday.toLowerCase().trim();
          const normalizedCalculated = calculatedDayName.toLowerCase();
          
          if (normalizedExpected !== normalizedCalculated) {
            console.log(`[book_appointment] INCONSISTENCY DETECTED: Expected "${normalizedExpected}" but date ${date} is actually "${normalizedCalculated}"`);
            const formattedDate = date.split('-').reverse().join('/');
            return JSON.stringify({
              success: false,
              error: `INCONSISTÊNCIA DETECTADA: Você mencionou "${args.expected_weekday}", mas ${formattedDate} é ${calculatedDayName}. Por favor, confirme a data correta com o cliente.`,
              suggestion: `Opções: "${calculatedDayName}, ${formattedDate}" ou verifique a data correta para "${normalizedExpected}" na lista de próximos dias.`
            });
          }
          console.log(`[book_appointment] Weekday validation PASSED: expected "${normalizedExpected}" = actual "${normalizedCalculated}"`);
        } else {
          console.log(`[book_appointment] WARNING: No expected_weekday provided - skipping consistency validation`);
        }

        // Get professionals that offer this service (use resolvedServiceId, not the original service_id)
        const { data: serviceProfessionals } = await supabase
          .from("agenda_pro_service_professionals")
          .select("professional_id")
          .eq("service_id", resolvedServiceId);
        
        const professionalIds = serviceProfessionals?.map((sp: any) => sp.professional_id) || [];
        
        if (professionalIds.length === 0) {
          return JSON.stringify({
            success: false,
            error: "Nenhum profissional está disponível para este serviço."
          });
        }

        // Get working hours for this day to find available professional
        const dayOfWeek = startTime.getDay();
        const { data: workingHours } = await supabase
          .from("agenda_pro_working_hours")
          .select("professional_id, start_time, end_time")
          .in("professional_id", professionalIds)
          .eq("day_of_week", dayOfWeek)
          .eq("is_enabled", true);

        if (!workingHours || workingHours.length === 0) {
          return JSON.stringify({
            success: false,
            error: "Não há profissionais disponíveis neste dia."
          });
        }

        // Find a professional that is available at this time
        let selectedProfessionalId: string | null = null;
        
        for (const wh of workingHours) {
          const whStart = new Date(`${date}T${wh.start_time}:00.000-03:00`);
          const whEnd = new Date(`${date}T${wh.end_time}:00.000-03:00`);
          
          // Check if slot is within working hours
          if (startTime < whStart || endTime > whEnd) continue;
          
          // Check if professional has conflicts
          const { data: conflicts } = await supabase
            .from("agenda_pro_appointments")
            .select("id")
            .eq("professional_id", wh.professional_id)
            .neq("status", "cancelled")
            .lt("start_time", endTime.toISOString())
            .gt("end_time", startTime.toISOString());
          
          if (!conflicts || conflicts.length === 0) {
            selectedProfessionalId = wh.professional_id;
            break;
          }
        }

        if (!selectedProfessionalId) {
          return JSON.stringify({
            success: false,
            error: "Este horário não está mais disponível. Por favor, escolha outro horário."
          });
        }

        // Normalize phone for lookup
        const normalizedPhone = client_phone.replace(/\D/g, '');

        // Try to find or create Agenda Pro client
        let agendaProClientId: string | null = null;
        
        const { data: existingAgendaClient } = await supabase
          .from("agenda_pro_clients")
          .select("id")
          .eq("law_firm_id", lawFirmId)
          .or(`phone.ilike.%${normalizedPhone}%,phone.ilike.%${normalizedPhone.slice(-9)}%`)
          .maybeSingle();

        if (existingAgendaClient) {
          agendaProClientId = existingAgendaClient.id;
          // Update client info
          await supabase
            .from("agenda_pro_clients")
            .update({
              name: client_name,
              email: client_email || undefined,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingAgendaClient.id);
          console.log(`[book_appointment] Updated existing Agenda Pro client ${existingAgendaClient.id}`);
        } else {
          // Create new Agenda Pro client
          const { data: newClient, error: clientError } = await supabase
            .from("agenda_pro_clients")
            .insert({
              law_firm_id: lawFirmId,
              name: client_name,
              phone: client_phone,
              email: client_email || null,
              notes: notes || null,
              origin: "ai_chat"
            })
            .select("id")
            .single();

          if (!clientError && newClient) {
            agendaProClientId = newClient.id;
            console.log(`[book_appointment] Created new Agenda Pro client ${newClient.id}`);
          } else {
            console.error("[book_appointment] Failed to create Agenda Pro client:", clientError);
          }
        }

        // Generate confirmation token
        const confirmationToken = crypto.randomUUID();

        // Create Agenda Pro appointment
        const { data: appointment, error: createError } = await supabase
          .from("agenda_pro_appointments")
          .insert({
            law_firm_id: lawFirmId,
            service_id: resolvedServiceId,
            professional_id: selectedProfessionalId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            duration_minutes: service.duration_minutes,
            client_id: agendaProClientId,
            client_name,
            client_phone,
            client_email: client_email || null,
            notes: notes || null,
            price: service.price,
            status: "scheduled",
            source: "api",
            confirmation_token: confirmationToken
          })
          .select("id")
          .single();

        if (createError) {
          console.error("[Scheduling] Error creating Agenda Pro appointment:", createError);
          return JSON.stringify({ success: false, error: "Erro ao criar agendamento" });
        }

        // Get company name and professional name for the message (needed for scheduled messages too)
        const { data: lawFirmData } = await supabase
          .from("law_firms")
          .select("name")
          .eq("id", lawFirmId)
          .single();
        const companyName = lawFirmData?.name || "";

        const { data: professionalData } = await supabase
          .from("agenda_pro_professionals")
          .select("name")
          .eq("id", selectedProfessionalId)
          .single();
        const professionalName = professionalData?.name || "";

        // Create scheduled reminder messages
        try {
          const appointmentStartTime = new Date(startTime);
          const now = new Date();
          
          // Get settings for reminder configuration
          const { data: reminderSettings } = await supabase
            .from("agenda_pro_settings")
            .select("reminder_hours_before, reminder_2_enabled, reminder_2_value, reminder_2_unit, reminder_message_template, business_name")
            .eq("law_firm_id", lawFirmId)
            .maybeSingle();
          
          const scheduledMessages: any[] = [];
          
          // Helper function to format message template
          const formatReminderMessage = (template: string | null, defaultMsg: string): string => {
            if (!template) return defaultMsg;
            const dateStr = appointmentStartTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
            const timeStr = appointmentStartTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            
            return template
              .replace(/{client_name}/g, client_name)
              .replace(/{service_name}/g, service.name)
              .replace(/{professional_name}/g, professionalName || "Profissional")
              .replace(/{date}/g, dateStr)
              .replace(/{time}/g, timeStr)
              .replace(/{business_name}/g, reminderSettings?.business_name || companyName || "");
          };
          
          const defaultReminderTemplate = "Olá {client_name}! 👋 Lembramos que você tem um agendamento de {service_name} no dia {date} às {time}. Confirme sua presença!";
          
          // First reminder (configurable hours, default 24h)
          const reminder1Hours = reminderSettings?.reminder_hours_before || 24;
          const reminderTime = new Date(appointmentStartTime.getTime() - reminder1Hours * 60 * 60 * 1000);
          
          if (reminderTime > now) {
            scheduledMessages.push({
              law_firm_id: lawFirmId,
              appointment_id: appointment.id,
              client_id: agendaProClientId,
              message_type: "reminder",
              message_content: formatReminderMessage(reminderSettings?.reminder_message_template || null, defaultReminderTemplate),
              scheduled_at: reminderTime.toISOString(),
              channel: "whatsapp",
              status: "pending",
            });
          }

          // Second reminder (configurable)
          if (reminderSettings?.reminder_2_enabled && reminderSettings?.reminder_2_value) {
            const reminder2Minutes = reminderSettings.reminder_2_unit === 'hours' 
              ? reminderSettings.reminder_2_value * 60 
              : reminderSettings.reminder_2_value;
            const reminder2Time = new Date(appointmentStartTime.getTime() - reminder2Minutes * 60 * 1000);
            
            if (reminder2Time > now) {
              scheduledMessages.push({
                law_firm_id: lawFirmId,
                appointment_id: appointment.id,
                client_id: agendaProClientId,
                message_type: "reminder_2",
                message_content: formatReminderMessage(reminderSettings?.reminder_message_template || null, defaultReminderTemplate),
                scheduled_at: reminder2Time.toISOString(),
                channel: "whatsapp",
                status: "pending",
              });
            }
          }

          // Pre-message if service has it enabled
          if (service.pre_message_enabled && service.pre_message_hours_before) {
            const preMessageTime = new Date(appointmentStartTime.getTime() - (service.pre_message_hours_before * 60 * 60 * 1000));
            
            if (preMessageTime > now) {
              scheduledMessages.push({
                law_firm_id: lawFirmId,
                appointment_id: appointment.id,
                client_id: agendaProClientId,
                message_type: "pre_message",
                message_content: service.pre_message_text || "Mensagem pré-atendimento",
                scheduled_at: preMessageTime.toISOString(),
                channel: "whatsapp",
                status: "pending",
              });
            }
          }

          // Insert all scheduled messages at once
          if (scheduledMessages.length > 0) {
            const { error: msgError } = await supabase
              .from("agenda_pro_scheduled_messages")
              .insert(scheduledMessages);
            
            if (msgError) {
              console.error("[Scheduling] Error creating scheduled messages:", msgError);
            } else {
              console.log(`[Scheduling] Created ${scheduledMessages.length} scheduled messages for appointment ${appointment.id}`);
            }
          }
        } catch (scheduledMsgError) {
          console.error("[Scheduling] Error in scheduled messages creation:", scheduledMsgError);
        }

        // Send confirmation notification via Agenda Pro notification system
        try {
          await fetch(`${supabaseUrl}/functions/v1/agenda-pro-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              appointment_id: appointment.id,
              type: "created"
            }),
          });
        } catch (e) {
          console.error("[Scheduling] Failed to send confirmation notification:", e);
        }

        // Format date and time nicely
        const dateObj = new Date(`${date}T${time}:00.000-03:00`);
        const endTimeObj = new Date(dateObj.getTime() + service.duration_minutes * 60000);
        
        const formattedDate = dateObj.toLocaleDateString("pt-BR", { 
          weekday: "long", 
          day: "numeric", 
          month: "long", 
          year: "numeric",
          timeZone: "America/Sao_Paulo"
        });
        const formattedStartTime = dateObj.toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Sao_Paulo"
        });
        const formattedEndTime = endTimeObj.toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Sao_Paulo"
        });

        const priceText = service.price ? `\n💰 *Valor:* R$ ${service.price.toFixed(2)}` : "";

        return JSON.stringify({
          success: true,
          message: `Olá ${client_name}!\n\nSeu agendamento foi confirmado! ✅\n\n📅 *Data:* ${formattedDate}\n⏰ *Horário:* ${formattedStartTime} às ${formattedEndTime}\n📋 *Serviço:* ${service.name}${professionalName ? `\n👤 *Profissional:* ${professionalName}` : ""}${priceText}${companyName ? `\n📍 *Local:* ${companyName}` : ""}\n\nVocê receberá uma mensagem para confirmar sua presença.\n\nAguardamos você! 😊`,
          appointment: {
            id: appointment.id,
            service: service.name,
            professional: professionalName,
            date: formattedDate,
            time: formattedStartTime,
            end_time: formattedEndTime,
            client_name,
            client_phone
          }
        });
      }

      case "list_client_appointments": {
        const { status, client_phone } = args;
        
        console.log(`[Scheduling] list_client_appointments - clientId: ${clientId}, conversationId: ${conversationId}, client_phone arg: ${client_phone}`);
        
        // Query Agenda Pro appointments
        let query = supabase
          .from("agenda_pro_appointments")
          .select(`
            id, start_time, end_time, status, client_name, client_phone, client_id,
            service:agenda_pro_services(name, duration_minutes),
            professional:agenda_pro_professionals(name)
          `)
          .eq("law_firm_id", lawFirmId)
          .order("start_time", { ascending: true });

        if (status === "scheduled") {
          query = query.eq("status", "scheduled");
        } else if (status === "confirmed") {
          query = query.eq("status", "confirmed");
        } else {
          query = query.in("status", ["scheduled", "confirmed"]);
        }

        query = query.gte("start_time", new Date().toISOString());

        const { data: allAppointments, error } = await query;

        if (error) {
          console.error("[Scheduling] Error listing Agenda Pro appointments:", error);
          return JSON.stringify({ success: false, error: "Erro ao buscar agendamentos" });
        }

        let filteredAppointments = allAppointments || [];
        
        // Try to filter by phone (primary method for AI chat)
        if (client_phone) {
          const normalizedPhone = client_phone.replace(/\D/g, '');
          const byPhone = filteredAppointments.filter((apt: any) => {
            const aptPhone = apt.client_phone?.replace(/\D/g, '') || '';
            return aptPhone.includes(normalizedPhone) || normalizedPhone.includes(aptPhone) ||
                   aptPhone.slice(-9) === normalizedPhone.slice(-9);
          });
          if (byPhone.length > 0) {
            filteredAppointments = byPhone;
          }
        }

        console.log(`[Scheduling] Found ${filteredAppointments.length} Agenda Pro appointments for client`);

        if (filteredAppointments.length === 0) {
          return JSON.stringify({
            success: true,
            message: "Nenhum agendamento encontrado para este cliente. Para ver os agendamentos, informe o telefone do cliente.",
            appointments: []
          });
        }

        const formattedAppointments = filteredAppointments.map((apt: any) => ({
          id: apt.id,
          service: apt.service?.name || "Serviço",
          professional: apt.professional?.name || "",
          date: new Date(apt.start_time).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          time: new Date(apt.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
          end_time: new Date(apt.end_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
          status: apt.status === "scheduled" ? "Agendado" : "Confirmado",
          client_name: apt.client_name,
          client_phone: apt.client_phone
        }));

        return JSON.stringify({
          success: true,
          message: `${filteredAppointments.length} agendamento(s) encontrado(s)`,
          appointments: formattedAppointments
        });
      }

      case "reschedule_appointment": {
        const { appointment_id, new_date, new_time } = args;

        if (!appointment_id || !new_date || !new_time) {
          return JSON.stringify({
            success: false,
            error: "Dados incompletos. Necessário: ID do agendamento, nova data e horário."
          });
        }

        // Get existing Agenda Pro appointment
        const { data: existingApt, error: aptError } = await supabase
          .from("agenda_pro_appointments")
          .select(`
            *, 
            service:agenda_pro_services(id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes),
            professional:agenda_pro_professionals(name)
          `)
          .eq("id", appointment_id)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (aptError || !existingApt) {
          return JSON.stringify({ success: false, error: "Agendamento não encontrado" });
        }

        if (existingApt.status === "cancelled") {
          return JSON.stringify({ success: false, error: "Este agendamento já foi cancelado" });
        }

        const service = existingApt.service;
        const newStartTime = new Date(`${new_date}T${new_time}:00.000-03:00`);
        const totalDuration = service.duration_minutes + 
          (service.buffer_before_minutes || 0) + 
          (service.buffer_after_minutes || 0);
        const newEndTime = new Date(newStartTime.getTime() + totalDuration * 60000);
        
        console.log(`[reschedule_appointment] Rescheduling to ${new_time} Brazil time = ${newStartTime.toISOString()} UTC`);

        // Check for conflicts with same professional
        const { data: conflicts } = await supabase
          .from("agenda_pro_appointments")
          .select("id")
          .eq("professional_id", existingApt.professional_id)
          .neq("id", appointment_id)
          .neq("status", "cancelled")
          .lt("start_time", newEndTime.toISOString())
          .gt("end_time", newStartTime.toISOString());

        if (conflicts && conflicts.length > 0) {
          return JSON.stringify({
            success: false,
            error: "Este horário não está disponível. Por favor, escolha outro."
          });
        }

        // Update the appointment
        const { error: updateError } = await supabase
          .from("agenda_pro_appointments")
          .update({
            start_time: newStartTime.toISOString(),
            end_time: newEndTime.toISOString(),
            status: "scheduled",
            confirmed_at: null,
            reminder_sent_at: null,
            confirmation_sent_at: null,
            pre_message_sent_at: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", appointment_id);

        if (updateError) {
          console.error("[Scheduling] Error rescheduling:", updateError);
          return JSON.stringify({ success: false, error: "Erro ao reagendar" });
        }

        // Send reschedule notification
        if (existingApt.client_phone) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/agenda-pro-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                appointment_id,
                type: "rescheduled"
              }),
            });
          } catch (e) {
            console.error("[Scheduling] Failed to send reschedule notification:", e);
          }
        }

        const { data: lawFirmData } = await supabase
          .from("law_firms")
          .select("name")
          .eq("id", lawFirmId)
          .single();
        const companyName = lawFirmData?.name || "";

        const dateObj = new Date(`${new_date}T${new_time}:00.000-03:00`);
        const rescheduleEndTime = new Date(dateObj.getTime() + service.duration_minutes * 60000);
        
        const formattedDate = dateObj.toLocaleDateString("pt-BR", { 
          weekday: "long", 
          day: "numeric", 
          month: "long", 
          year: "numeric",
          timeZone: "America/Sao_Paulo"
        });
        const formattedStartTime = dateObj.toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Sao_Paulo"
        });
        const formattedEndTime = rescheduleEndTime.toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Sao_Paulo"
        });

        return JSON.stringify({
          success: true,
          message: `Seu agendamento foi reagendado com sucesso! 📅\n\n📅 *Nova data:* ${formattedDate}\n⏰ *Novo horário:* ${formattedStartTime} às ${formattedEndTime}\n📋 *Serviço:* ${service.name}${existingApt.professional?.name ? `\n👤 *Profissional:* ${existingApt.professional.name}` : ""}${companyName ? `\n📍 *Local:* ${companyName}` : ""}\n\nAguardamos você! 😊`,
          appointment: {
            id: appointment_id,
            service: service.name,
            date: formattedDate,
            time: formattedStartTime,
            end_time: formattedEndTime
          }
        });
      }

      case "cancel_appointment": {
        const { appointment_id, reason } = args;

        if (!appointment_id) {
          return JSON.stringify({
            success: false,
            error: "ID do agendamento é obrigatório"
          });
        }

        const { data: existingApt, error: aptError } = await supabase
          .from("agenda_pro_appointments")
          .select("*, service:agenda_pro_services(name)")
          .eq("id", appointment_id)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (aptError || !existingApt) {
          return JSON.stringify({ success: false, error: "Agendamento não encontrado" });
        }

        if (existingApt.status === "cancelled") {
          return JSON.stringify({ success: false, error: "Este agendamento já foi cancelado" });
        }

        const { error: updateError } = await supabase
          .from("agenda_pro_appointments")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: reason || "Cancelado pelo cliente via chat",
            cancelled_by: "client"
          })
          .eq("id", appointment_id);

        if (updateError) {
          console.error("[Scheduling] Error cancelling:", updateError);
          return JSON.stringify({ success: false, error: "Erro ao cancelar" });
        }

        // Cancel associated scheduled messages
        await supabase
          .from("agenda_pro_scheduled_messages")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("appointment_id", appointment_id)
          .eq("status", "pending");

        // Send cancellation notification
        if (existingApt.client_phone) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/agenda-pro-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                appointment_id,
                type: "cancelled"
              }),
            });
          } catch (e) {
            console.error("[Scheduling] Failed to send cancellation notification:", e);
          }
        }

        return JSON.stringify({
          success: true,
          message: `Agendamento cancelado com sucesso. Se desejar, você pode agendar um novo horário.`,
          cancelled_appointment: {
            id: appointment_id,
            service: existingApt.service?.name
          }
        });
      }

      case "confirm_appointment": {
        const { appointment_id } = args;

        if (!appointment_id) {
          return JSON.stringify({
            success: false,
            error: "ID do agendamento é obrigatório"
          });
        }

        const { data: existingApt, error: aptError } = await supabase
          .from("agenda_pro_appointments")
          .select("*, service:agenda_pro_services(name), professional:agenda_pro_professionals(name)")
          .eq("id", appointment_id)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (aptError || !existingApt) {
          return JSON.stringify({ success: false, error: "Agendamento não encontrado" });
        }

        if (existingApt.status === "cancelled") {
          return JSON.stringify({ success: false, error: "Este agendamento foi cancelado" });
        }

        if (existingApt.status === "confirmed") {
          return JSON.stringify({ success: true, message: "Este agendamento já está confirmado!" });
        }

        const { error: updateError } = await supabase
          .from("agenda_pro_appointments")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            confirmed_via: "ai_chat"
          })
          .eq("id", appointment_id);

        if (updateError) {
          console.error("[Scheduling] Error confirming:", updateError);
          return JSON.stringify({ success: false, error: "Erro ao confirmar" });
        }

        const aptDate = new Date(existingApt.start_time);
        const formattedDate = aptDate.toLocaleDateString("pt-BR", { 
          day: "numeric", 
          month: "long",
          timeZone: "America/Sao_Paulo"
        });
        const formattedTime = aptDate.toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Sao_Paulo"
        });

        return JSON.stringify({
          success: true,
          message: `Agendamento confirmado com sucesso! ✅\n\nEsperamos você no dia ${formattedDate} às ${formattedTime}.\n\nServiço: ${existingApt.service?.name}${existingApt.professional?.name ? `\nProfissional: ${existingApt.professional.name}` : ""}`,
          confirmed_appointment: {
            id: appointment_id,
            service: existingApt.service?.name,
            date: formattedDate,
            time: formattedTime
          }
        });
      }

      default:
        return JSON.stringify({ success: false, error: `Ferramenta de agendamento desconhecida: ${toolCall.name}` });
    }
  } catch (error) {
    console.error(`[Scheduling] Tool error:`, error);
    return JSON.stringify({ error: "Erro ao executar ação de agendamento" });
  }
}

/**
 * Parse [IMAGE]url from template content
 * Returns: { cleanContent, extractedMediaUrl }
 * - Accepts [IMAGE]url or [IMAGE] url (with space)
 * - Only extracts the FIRST [IMAGE] marker; removes all occurrences from content
 */
function parseImageFromContent(content: string): { cleanContent: string; extractedMediaUrl: string | null } {
  if (!content) return { cleanContent: content, extractedMediaUrl: null };
  
  // Pattern: [IMAGE] followed by optional space then URL until whitespace/newline
  const imagePattern = /\[IMAGE\]\s*(https?:\/\/[^\s\n]+)/gi;
  const matches = [...content.matchAll(imagePattern)];
  
  let extractedMediaUrl: string | null = null;
  if (matches.length > 0) {
    // Use first match as the media URL
    extractedMediaUrl = matches[0][1].trim();
    console.log(`[AI Chat] Extracted image URL from content: ${extractedMediaUrl}`);
  }
  
  // Remove ALL [IMAGE]url occurrences from content
  let cleanContent = content.replace(imagePattern, '').trim();
  
  // Also clean up any orphaned [IMAGE] tags without URLs
  cleanContent = cleanContent.replace(/\[IMAGE\]\s*/gi, '').trim();
  
  // Clean up multiple consecutive newlines
  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();
  
  return { cleanContent, extractedMediaUrl };
}

// Execute template tool call - ACTUALLY SENDS the template content
// Now includes direct WhatsApp sending via Evolution API
async function executeTemplateTool(
  supabase: any,
  lawFirmId: string,
  conversationId: string,
  toolCall: { name: string; arguments: string }
): Promise<string> {
  try {
    const args = JSON.parse(toolCall.arguments);
    
    console.log(`[AI Chat] Executing template tool: ${toolCall.name}`, args);
    
    const templateName = args.template_name;
    
    // Search for template by name or shortcut
    const { data: templates } = await supabase
      .from("templates")
      .select("id, name, shortcut, content, media_url, media_type")
      .eq("law_firm_id", lawFirmId)
      .eq("is_active", true);
    
    if (!templates || templates.length === 0) {
      return JSON.stringify({ 
        success: false, 
        error: "Nenhum template encontrado. Os templates precisam ser configurados primeiro." 
      });
    }
    
    // Find best match
    const normalizedSearch = templateName.toLowerCase().trim();
    const matchedTemplate = templates.find((t: any) => 
      t.name.toLowerCase() === normalizedSearch ||
      t.shortcut.toLowerCase() === normalizedSearch ||
      t.name.toLowerCase().includes(normalizedSearch) ||
      normalizedSearch.includes(t.name.toLowerCase())
    );
    
    if (!matchedTemplate) {
      const availableTemplates = templates.map((t: any) => t.name).join(", ");
      return JSON.stringify({ 
        success: false, 
        error: `Template "${templateName}" não encontrado. Templates disponíveis: ${availableTemplates}` 
      });
    }
    
    // PRIORITY: 1) media_url field, 2) [IMAGE] in content, 3) text only
    let finalMediaUrl = matchedTemplate.media_url || null;
    let finalMediaType = matchedTemplate.media_type || null;
    let finalContent = matchedTemplate.content || '';
    
    // If no media_url but content has [IMAGE], parse it
    if (!finalMediaUrl && matchedTemplate.content) {
      const parsed = parseImageFromContent(matchedTemplate.content);
      if (parsed.extractedMediaUrl) {
        finalMediaUrl = parsed.extractedMediaUrl;
        finalContent = parsed.cleanContent;
        // Detect media type from URL extension
        const ext = finalMediaUrl.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
          finalMediaType = 'image';
        } else if (['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) {
          finalMediaType = 'video';
        } else if (['pdf'].includes(ext || '')) {
          finalMediaType = 'document';
        } else {
          finalMediaType = 'image'; // Default assumption for [IMAGE] tag
        }
        console.log(`[AI Chat] Parsed [IMAGE] from template - URL: ${finalMediaUrl}, Type: ${finalMediaType}`);
      }
    }
    
    // Convert media type to MIME type for database column
    let mediaMimeType: string | null = null;
    if (finalMediaUrl && finalMediaType) {
      const ext = finalMediaUrl.split('.').pop()?.toLowerCase() || '';
      if (finalMediaType === 'image') {
        mediaMimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      } else if (finalMediaType === 'video') {
        mediaMimeType = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'video/mp4';
      } else if (finalMediaType === 'document') {
        mediaMimeType = 'application/pdf';
      }
    }
    
    // ACTUALLY SEND the template content as a message if we have a valid conversation
    if (!isValidUUID(conversationId)) {
      return JSON.stringify({ error: "Conversa inválida para envio de template" });
    }
    
    // Fetch conversation data to determine channel (WhatsApp vs Widget)
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("whatsapp_instance_id, remote_jid, origin")
      .eq("id", conversationId)
      .single();
    
    if (convError || !conversation) {
      console.error(`[AI Chat] Failed to fetch conversation for template:`, convError);
      return JSON.stringify({ error: "Erro ao buscar dados da conversa" });
    }
    
    const origin = (conversation.origin || '').toUpperCase();
    const isWidgetConversation = ['WIDGET', 'TRAY', 'SITE', 'WEB'].includes(origin);
    const instanceId = conversation.whatsapp_instance_id;
    const remoteJid = conversation.remote_jid;
    
    console.log(`[AI Chat] Template send context: origin=${origin}, isWidget=${isWidgetConversation}, instanceId=${instanceId}`);
    
    // For WhatsApp conversations, send directly via Evolution API
    let whatsappTextMessageId: string | null = null;
    let whatsappMediaMessageId: string | null = null;
    let whatsappSendSuccess = false;
    
    if (!isWidgetConversation && instanceId && remoteJid) {
      // Fetch WhatsApp instance details
      const { data: instance, error: instError } = await supabase
        .from("whatsapp_instances")
        .select("api_url, api_key, instance_name, status")
        .eq("id", instanceId)
        .single();
      
      if (instance && instance.status === 'connected') {
        const apiUrl = (instance.api_url || '').replace(/\/+$/, '').replace(/\/manager$/i, '');
        const targetNumber = remoteJid.split("@")[0];
        
        if (apiUrl && targetNumber) {
          try {
            // Send text first (if there's content)
            if (finalContent) {
              console.log(`[AI Chat] Sending template text to WhatsApp: ${finalContent.substring(0, 50)}...`);
              const textResponse = await fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': instance.api_key || '',
                },
                body: JSON.stringify({ number: targetNumber, text: finalContent }),
              });
              
              if (textResponse.ok) {
                const textResult = await textResponse.json();
                whatsappTextMessageId = textResult?.key?.id;
                whatsappSendSuccess = true;
                console.log(`[AI Chat] Template text sent to WhatsApp: ${whatsappTextMessageId}`);
              } else {
                const errorText = await textResponse.text();
                console.error(`[AI Chat] Failed to send template text to WhatsApp:`, errorText);
              }
            }
            
            // Send media if available
            if (finalMediaUrl) {
              // Small delay between text and media for natural flow
              if (finalContent) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              
              console.log(`[AI Chat] Sending template media to WhatsApp: ${finalMediaType}, URL: ${finalMediaUrl}`);
              
              let mediaEndpoint = `${apiUrl}/message/sendMedia/${instance.instance_name}`;
              let mediaPayload: Record<string, unknown> = { number: targetNumber };
              
              switch (finalMediaType) {
                case 'image':
                  mediaPayload = {
                    ...mediaPayload,
                    mediatype: 'image',
                    mimetype: mediaMimeType || 'image/jpeg',
                    caption: '', // No caption since text already sent
                    media: finalMediaUrl,
                  };
                  break;
                case 'video':
                  mediaPayload = {
                    ...mediaPayload,
                    mediatype: 'video',
                    mimetype: mediaMimeType || 'video/mp4',
                    caption: '',
                    media: finalMediaUrl,
                  };
                  break;
                case 'document':
                  const urlParts = finalMediaUrl.split('/');
                  const fileName = urlParts[urlParts.length - 1].split('?')[0] || 'document.pdf';
                  mediaPayload = {
                    ...mediaPayload,
                    mediatype: 'document',
                    mimetype: mediaMimeType || 'application/pdf',
                    caption: '',
                    fileName: fileName,
                    media: finalMediaUrl,
                  };
                  break;
                default:
                  // Default to image
                  mediaPayload = {
                    ...mediaPayload,
                    mediatype: 'image',
                    mimetype: 'image/jpeg',
                    caption: '',
                    media: finalMediaUrl,
                  };
              }
              
              const mediaResponse = await fetch(mediaEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': instance.api_key || '',
                },
                body: JSON.stringify(mediaPayload),
              });
              
              if (mediaResponse.ok) {
                const mediaResult = await mediaResponse.json();
                whatsappMediaMessageId = mediaResult?.key?.id;
                whatsappSendSuccess = true;
                console.log(`[AI Chat] Template media sent to WhatsApp: ${whatsappMediaMessageId}`);
              } else {
                const errorText = await mediaResponse.text();
                console.error(`[AI Chat] Failed to send template media to WhatsApp:`, errorText);
              }
            }
          } catch (sendError) {
            console.error(`[AI Chat] Error sending template to WhatsApp:`, sendError);
          }
        }
      } else {
        console.log(`[AI Chat] WhatsApp instance not connected, will save to DB only`);
      }
    }
    
    // CRITICAL FIX: Save TEXT and MEDIA as SEPARATE messages
    // This ensures each message has its own whatsapp_message_id for:
    // 1. Proper duplicate detection in webhook
    // 2. Correct media decryption (media needs its own message ID)
    
    let savedTextMsgId: string | null = null;
    let savedMediaMsgId: string | null = null;
    
    // Save TEXT message if there's content
    if (finalContent) {
      const { data: savedTextMsg, error: textSaveError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        law_firm_id: lawFirmId,
        whatsapp_message_id: whatsappTextMessageId,
        content: finalContent,
        sender_type: "ai",
        is_from_me: true,
        message_type: 'text',
        media_url: null,
        media_mime_type: null,
        status: whatsappSendSuccess ? "sent" : "delivered",
        ai_generated: true
        // Note: template_id tracking via logs, not metadata column
      }).select("id").single();
      
      if (textSaveError) {
        console.error(`[AI Chat] Failed to save template text message:`, textSaveError);
      } else {
        savedTextMsgId = savedTextMsg?.id;
        console.log(`[AI Chat] Template text message saved: ${savedTextMsgId}, whatsappId: ${whatsappTextMessageId}`);
      }
    }
    
    // Save MEDIA message SEPARATELY if there's media
    if (finalMediaUrl) {
      // Determine the correct message_type based on media type
      let mediaMessageType = 'image';
      if (finalMediaType === 'video') mediaMessageType = 'video';
      else if (finalMediaType === 'document') mediaMessageType = 'document';
      
      const { data: savedMediaMsg, error: mediaSaveError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        law_firm_id: lawFirmId,
        whatsapp_message_id: whatsappMediaMessageId,
        content: null,
        sender_type: "ai",
        is_from_me: true,
        message_type: mediaMessageType,
        media_url: finalMediaUrl,
        media_mime_type: mediaMimeType,
        status: whatsappSendSuccess ? "sent" : "delivered",
        ai_generated: true
        // Note: template tracking via logs, public URL renders directly
      }).select("id").single();
      
      if (mediaSaveError) {
        console.error(`[AI Chat] Failed to save template media message:`, mediaSaveError);
      } else {
        savedMediaMsgId = savedMediaMsg?.id;
        console.log(`[AI Chat] Template media message saved: ${savedMediaMsgId}, whatsappId: ${whatsappMediaMessageId}, type: ${mediaMessageType}`);
      }
    }
    
    // Log overall status
    console.log(`[AI Chat] Template save complete: textMsg=${savedTextMsgId}, mediaMsg=${savedMediaMsgId}, whatsappSent=${whatsappSendSuccess}`);
    
    // Update conversation last_message_at
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    
    // Return success with instruction for AI to acknowledge
    let response: any = {
      success: true,
      template_sent: true,
      template_name: matchedTemplate.name,
      has_media: !!finalMediaUrl,
      whatsapp_sent: whatsappSendSuccess,
      instruction: `O template "${matchedTemplate.name}" FOI ENVIADO com sucesso ao cliente. NÃO repita o conteúdo do template. Apenas confirme brevemente que enviou e pergunte se o cliente tem dúvidas.`
    };
    
    // Include media info if available
    if (finalMediaUrl) {
      response.media_sent = true;
      response.media_type = finalMediaType;
      response.instruction += ` Uma ${finalMediaType || 'mídia'} também foi enviada junto com o texto.`;
    }
    
    return JSON.stringify(response);
    
  } catch (error) {
    console.error(`[AI Chat] Template tool error:`, error);
    return JSON.stringify({ error: "Erro ao enviar template" });
  }
}

// Fetch knowledge base content for an agent
async function getAgentKnowledge(supabase: any, automationId: string): Promise<string> {
  try {
    // Get knowledge items linked to this specific agent
    const { data: linkedKnowledge, error } = await supabase
      .from("agent_knowledge")
      .select(`
        knowledge_item_id,
        knowledge_items (
          id,
          title,
          content,
          category,
          item_type,
          file_url,
          file_name
        )
      `)
      .eq("automation_id", automationId);
    
    if (error || !linkedKnowledge || linkedKnowledge.length === 0) {
      return "";
    }
    
    // Build knowledge context - include both text content and document references
    const knowledgeTexts = linkedKnowledge
      .map((item: any) => {
        const ki = item.knowledge_items;
        if (!ki) return null;
        
        // If has text content, use it
        if (ki.content) {
          return `### ${ki.title}\n${ki.content}`;
        }
        
        // If is a document (PDF), add reference so AI knows it exists
        if (ki.item_type === 'document' && ki.file_url) {
          return `### ${ki.title} (Documento)\n[Arquivo disponível: ${ki.file_name || ki.title}]`;
        }
        
        return null;
      })
      .filter(Boolean);
    
    if (knowledgeTexts.length === 0) {
      return "";
    }
    
    return `\n\n## BASE DE CONHECIMENTO\nUse as informações abaixo para responder perguntas do cliente:\n\n${knowledgeTexts.join("\n\n")}`;
    
  } catch (error) {
    console.error("[AI Chat] Error fetching agent knowledge:", error);
    return "";
  }
}

// Generate conversation summary if needed
async function generateSummaryIfNeeded(
  supabase: any,
  conversationId: string,
  LOVABLE_API_KEY: string
): Promise<string | null> {
  try {
    // Check if we need to generate a new summary
    const { data: conv } = await supabase
      .from("conversations")
      .select("summary_message_count, last_summarized_at, ai_summary")
      .eq("id", conversationId)
      .single();
    
    if (!conv) return null;
    
    const lastCount = conv.summary_message_count || 0;
    
    // Get current message count
    const { count: currentCount } = await supabase
      .from("messages")
      .select("id", { count: "exact" })
      .eq("conversation_id", conversationId);
    
    // Generate summary every 6 user messages for better context retention
    if (currentCount && currentCount > lastCount + 6) {
      // Fetch last 50 messages for summary
      const { data: allMessages } = await supabase
        .from("messages")
        .select("content, is_from_me, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(50);
      
      if (!allMessages || allMessages.length < 10) {
        return conv.ai_summary || null;
      }
      
      const conversationText = (allMessages as any[])
        .filter((m: any) => m.content)
        .map((m: any) => `${m.is_from_me ? "Assistente" : "Cliente"}: ${m.content}`)
        .join("\n");

      const summaryPrompt = `Atualize o resumo desta conversa de atendimento, preservando os seguintes elementos-chave:
- Objetivo principal do cliente e o que ele busca
- Decisões tomadas ou acordos feitos
- Preferências e informações pessoais coletadas (nome, telefone, dados relevantes)
- Fatos importantes mencionados pelo cliente
- Itens pendentes ou próximos passos

Seja conciso (máximo 5 frases). Não invente informações. Se já houver um resumo anterior, incorpore as novas informações.

CONVERSA:
${conversationText}

Responda apenas com o resumo atualizado, sem formatação especial.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: summaryPrompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        console.error("[AI Chat] Failed to generate summary");
        return conv.ai_summary || null;
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content;

      if (summary) {
        await supabase
          .from("conversations")
          .update({
            ai_summary: summary,
            last_summarized_at: new Date().toISOString(),
            summary_message_count: currentCount,
          })
          .eq("id", conversationId);

        console.log(`[AI Chat] Generated new summary for conversation ${conversationId}`);
        return summary;
      }

      return conv.ai_summary || null;
    }
    
    return conv.ai_summary || null;
  } catch (error) {
    console.error("[AI Chat] Summary generation error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const errorRef = generateErrorRef();

  try {
    // ============= INPUT PARSING AND VALIDATION =============
    let requestBody;
    try {
      requestBody = await req.json();
    } catch {
      console.error(`[${errorRef}] Invalid JSON body`);
      return new Response(
        JSON.stringify({ error: "Invalid request format", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let { conversationId, message, automationId, source, context }: ChatRequest = requestBody;

    // Validate required fields - conversationId can be widget ID or UUID
    // Allow empty message (but not null/undefined) when document/media context is present
    if (!conversationId || (message === undefined || message === null)) {
      console.error(`[${errorRef}] Missing required fields`, { conversationId: !!conversationId, message: message === undefined ? 'undefined' : message === null ? 'null' : 'present' });
      return new Response(
        JSON.stringify({ error: "conversationId and message are required", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Track if this is a widget conversation (needs special handling)
    // CRITICAL FIX: Also check source to handle conversations where ID is already a UUID
    let isWidgetConversation = false;
    let widgetSessionId = '';

    // Validate conversationId - accept UUID or widget format (widget_KEY_visitorID)
    if (!isValidUUID(conversationId)) {
      if (isWidgetId(conversationId)) {
        isWidgetConversation = true;
        widgetSessionId = conversationId;
        console.log(`[AI Chat] Widget conversation detected (by ID format): ${widgetSessionId}`);
      } else {
        console.error(`[${errorRef}] Invalid conversationId format`);
        return new Response(
          JSON.stringify({ error: "Invalid request format", ref: errorRef }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // conversationId is a UUID - check if it's still a widget conversation by source
      if (source === 'WIDGET' || source === 'TRAY') {
        isWidgetConversation = true;
        console.log(`[AI Chat] Widget conversation detected (by source=${source}, uuid=${conversationId})`);
      }
    }

    // Validate message (string and length)
    if (typeof message !== 'string') {
      console.error(`[${errorRef}] Invalid message type`);
      return new Response(
        JSON.stringify({ error: "Invalid message format", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      console.error(`[${errorRef}] Message too long: ${message.length} chars`);
      return new Response(
        JSON.stringify({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`, ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate automationId if provided
    if (automationId && !isValidUUID(automationId)) {
      console.error(`[${errorRef}] Invalid automationId format`);
      return new Response(
        JSON.stringify({ error: "Invalid request format", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate source if provided
    if (source && !VALID_SOURCES.includes(source)) {
      console.error(`[${errorRef}] Invalid source: ${source}`);
      source = 'web'; // Default to 'web' for invalid sources
    }

    // Validate and sanitize context
    if (context) {
      if (context.clientName) {
        context.clientName = sanitizeString(context.clientName);
      }
      if (context.clientPhone) {
        context.clientPhone = sanitizeString(context.clientPhone, 20);
      }
      if (context.currentStatus) {
        context.currentStatus = sanitizeString(context.currentStatus, 50);
      }
      if (context.lawFirmId && !isValidUUID(context.lawFirmId)) {
        console.error(`[${errorRef}] Invalid context.lawFirmId format`);
        return new Response(
          JSON.stringify({ error: "Invalid request format", ref: errorRef }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (context.clientId && !isValidUUID(context.clientId)) {
        console.error(`[${errorRef}] Invalid context.clientId format`);
        return new Response(
          JSON.stringify({ error: "Invalid request format", ref: errorRef }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[AI Chat] Request validated - conversationId: ${conversationId}, messageLength: ${message.length}, isWidget: ${isWidgetConversation}, source: ${source}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Tray/Widget Chat integration settings if source is web/TRAY/WIDGET
    let traySettings: any = null;
    let validatedLawFirmId: string | null = null;
    
    if ((source === 'web' || source === 'TRAY' || source === 'WIDGET') && context?.lawFirmId) {
      // SECURITY: For widget requests, validate lawFirmId matches the widget_key
      if (isWidgetConversation && context?.widgetKey) {
        const { data: widgetValidation } = await supabase
          .from("tray_chat_integrations")
          .select("law_firm_id, default_automation_id, default_department_id, default_status_id, default_handler_type, default_human_agent_id, is_active")
          .eq("widget_key", context.widgetKey)
          .eq("is_active", true)
          .maybeSingle();
        
        if (!widgetValidation) {
          console.error(`[${errorRef}] Widget key not found or inactive: ${context.widgetKey}`);
          return new Response(
            JSON.stringify({ error: "Widget configuration not found", ref: errorRef }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // CRITICAL: Override lawFirmId with the validated one from widget_key
        if (widgetValidation.law_firm_id !== context.lawFirmId) {
          console.warn(`[AI Chat] LawFirmId mismatch - using validated: ${widgetValidation.law_firm_id} instead of provided: ${context.lawFirmId}`);
        }
        validatedLawFirmId = widgetValidation.law_firm_id;
        traySettings = widgetValidation;
        
        console.log(`[AI Chat] Widget validated for law_firm ${validatedLawFirmId}:`, {
          default_handler_type: traySettings.default_handler_type,
          default_automation_id: traySettings.default_automation_id,
          default_human_agent_id: traySettings.default_human_agent_id,
          default_department_id: traySettings.default_department_id,
          default_status_id: traySettings.default_status_id
        });
      } else {
        // Non-widget requests - use provided lawFirmId
        const { data: trayIntegration } = await supabase
          .from("tray_chat_integrations")
          .select("default_automation_id, default_department_id, default_status_id, default_handler_type, default_human_agent_id, is_active")
          .eq("law_firm_id", context.lawFirmId)
          .eq("is_active", true)
          .maybeSingle();
        
        if (trayIntegration) {
          traySettings = trayIntegration;
          validatedLawFirmId = context.lawFirmId;
          console.log(`[AI Chat] Loaded Tray settings for law_firm ${context.lawFirmId}:`, {
            default_handler_type: traySettings.default_handler_type,
            default_automation_id: traySettings.default_automation_id
          });
        }
      }
      
      // Use Tray's default automation if handler type is 'ai' and no automationId was provided
      if (!automationId && traySettings?.default_handler_type === 'ai' && traySettings?.default_automation_id) {
        automationId = traySettings.default_automation_id;
        console.log(`[AI Chat] Using Tray/Widget default AI automation: ${automationId}`);
      }
    }
    
    // For widget conversations, create or find existing conversation
    // CRITICAL: Use validatedLawFirmId (from widget_key validation) for tenant isolation
    // IMPORTANT: Widget can send either a session id (widget_...) OR the real conversation UUID.
    if (isWidgetConversation && validatedLawFirmId) {
      // Extract client info from context
      const clientName = context?.clientName || "Visitante Web";
      const clientPhone = context?.clientPhone || null;
      const clientEmail = (context as any)?.clientEmail || null;

      const widgetOrigins = new Set(["WIDGET", "TRAY", "SITE", "WEB"]);

      // 1) If we received a real UUID (common after first message), respect panel transfers
      // by loading the conversation directly.
      let convById: any = null;
      if (isValidUUID(conversationId)) {
        const { data: maybeConvById } = await supabase
          .from("conversations")
          .select("id, client_id, origin, remote_jid, current_handler, current_automation_id")
          .eq("id", conversationId)
          .eq("law_firm_id", validatedLawFirmId)
          .maybeSingle();

        if (maybeConvById && widgetOrigins.has(maybeConvById.origin)) {
          convById = maybeConvById;

          // Keep remote_jid as the canonical widget session id when available
          if (!widgetSessionId && convById.remote_jid) {
            widgetSessionId = convById.remote_jid;
          }

          console.log(
            `[AI Chat] Widget conversation found by UUID: ${convById.id}, current_handler: ${convById.current_handler}, current_automation_id: ${convById.current_automation_id}`
          );

          // CRITICAL FIX: If handler is 'human', STOP AI from responding entirely
          // A human agent has taken over this conversation
          if (convById.current_handler === "human") {
            console.log(`[AI Chat] ⛔ Conversation is in HUMAN mode (handler=human) - AI will NOT respond`);
            
            // Save the client message so it appears in the chat
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              content: message,
              sender_type: "client",
              is_from_me: false,
              message_type: "text",
              status: "delivered"
            });
            
            // Update conversation last_message_at AND unarchive if archived
            // This ensures archived widget conversations are restored when client sends new message
            await supabase
              .from("conversations")
              .update({ 
                last_message_at: new Date().toISOString(),
                // Clear archived state - conversation should reappear in active list
                archived_at: null,
                archived_reason: null,
                archived_next_responsible_type: null,
                archived_next_responsible_id: null
              })
              .eq("id", conversationId);
            
            return new Response(
              JSON.stringify({ 
                conversationId,
                messageId: null,
                status: "awaiting_human_agent",
                handler: "human"
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // CRITICAL FIX: If the conversation was transferred to AI in the panel, use that automation
          if (convById.current_handler === "ai") {
            if (convById.current_automation_id) {
              automationId = convById.current_automation_id;
              console.log(`[AI Chat] Using conversation's current AI automation (from panel transfer): ${automationId}`);
            } else if (!automationId && traySettings?.default_automation_id) {
              // Fallback for edge cases where handler is AI but automation wasn't set
              automationId = traySettings.default_automation_id;
              console.log(`[AI Chat] Conversation in AI mode but missing automation; falling back to default: ${automationId}`);
            }
          }

          // Update contact info if provided and changed
          if (clientName && clientName !== "Visitante Web") {
            await supabase
              .from("conversations")
              .update({ contact_name: clientName, contact_phone: clientPhone })
              .eq("id", conversationId);

            if (convById.client_id) {
              await supabase
                .from("clients")
                .update({
                  name: clientName,
                  phone: clientPhone || undefined,
                  email: clientEmail || undefined,
                })
                .eq("id", convById.client_id);
            }
          }
        }
      }

      // 2) If we still don't have a widgetSessionId (e.g., UUID not found), try reconstructing it
      // from the widget payload so we can find/create the conversation by remote_jid.
      if (!widgetSessionId) {
        const visitorIdRaw = (context as any)?.visitorId;
        const visitorId = sanitizeString(visitorIdRaw, 120);
        if (context?.widgetKey && visitorId) {
          widgetSessionId = `widget_${context.widgetKey}_${visitorId}`;
        }
      }

      // 3) Session-based flow (first message OR when UUID lookup failed)
      if (widgetSessionId && (!isValidUUID(conversationId) || !convById)) {
        // Look for existing conversation with this widget session ID
        // CRITICAL: Include current_handler and current_automation_id to respect transfers made in the panel
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id, client_id, current_handler, current_automation_id")
          .eq("law_firm_id", validatedLawFirmId)
          .eq("origin", "WIDGET")
          .eq("remote_jid", widgetSessionId)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
          console.log(
            `[AI Chat] Found existing widget conversation (by remote_jid): ${conversationId}, current_handler: ${existingConv.current_handler}, current_automation_id: ${existingConv.current_automation_id}`
          );

          // CRITICAL FIX: If handler is 'human', STOP AI from responding entirely
          // A human agent has taken over this conversation
          if (existingConv.current_handler === "human") {
            console.log(`[AI Chat] ⛔ Conversation is in HUMAN mode (handler=human) - AI will NOT respond`);
            
            // Save the client message so it appears in the chat
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              content: message,
              sender_type: "client",
              is_from_me: false,
              message_type: "text",
              status: "delivered"
            });
            
            // Update conversation last_message_at
            await supabase
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversationId);
            
            return new Response(
              JSON.stringify({ 
                conversationId,
                messageId: null,
                status: "awaiting_human_agent",
                handler: "human"
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // CRITICAL FIX: If the conversation was transferred to AI in the panel, use that automation
          // This overrides the widget defaults when handler is 'ai' and automation is set
          if (existingConv.current_handler === "ai") {
            if (existingConv.current_automation_id) {
              automationId = existingConv.current_automation_id;
              console.log(`[AI Chat] Using conversation's current AI automation (from panel transfer): ${automationId}`);
            } else if (!automationId && traySettings?.default_automation_id) {
              automationId = traySettings.default_automation_id;
              console.log(`[AI Chat] Conversation in AI mode but missing automation; falling back to default: ${automationId}`);
            }
          }

          // Update contact info if provided and changed
          if (clientName && clientName !== "Visitante Web") {
            await supabase
              .from("conversations")
              .update({ contact_name: clientName, contact_phone: clientPhone })
              .eq("id", conversationId);

            if (existingConv.client_id) {
              await supabase
                .from("clients")
                .update({
                  name: clientName,
                  phone: clientPhone || undefined,
                  email: clientEmail || undefined,
                })
                .eq("id", existingConv.client_id);
            }
          }
        } else {
          // Create new client record if phone provided
          let clientId: string | null = null;

          if (clientPhone) {
            const { data: existingClient } = await supabase
              .from("clients")
              .select("id")
              .eq("law_firm_id", validatedLawFirmId)
              .eq("phone", clientPhone)
              .maybeSingle();

            if (existingClient) {
              clientId = existingClient.id;
              await supabase
                .from("clients")
                .update({
                  name: clientName,
                  email: clientEmail || undefined,
                })
                .eq("id", clientId);
              console.log(`[AI Chat] Found existing client: ${clientId}`);
            } else {
              const { data: newClient, error: clientError } = await supabase
                .from("clients")
                .insert({
                  law_firm_id: validatedLawFirmId,
                  name: clientName,
                  phone: clientPhone,
                  email: clientEmail || null,
                  notes: `Origem: Widget do site`,
                  department_id: traySettings?.default_department_id || null,
                  custom_status_id: traySettings?.default_status_id || null,
                })
                .select("id")
                .single();

              if (!clientError && newClient) {
                clientId = newClient.id;
                console.log(`[AI Chat] Created new client: ${clientId}`);
              }
            }
          }

          // Determine handler based on settings
          const handlerType = traySettings?.default_handler_type || "human";
          const assignedTo = handlerType === "human" ? (traySettings?.default_human_agent_id || null) : null;
          const currentAutomationId = handlerType === "ai" ? (traySettings?.default_automation_id || null) : null;

          // Create new conversation for widget with VALIDATED law_firm_id
          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert({
              law_firm_id: validatedLawFirmId,
              remote_jid: widgetSessionId,
              contact_name: clientName,
              contact_phone: clientPhone,
              client_id: clientId,
              origin: "WIDGET",
              origin_metadata: {
                widget_session: widgetSessionId,
                widget_key: context?.widgetKey || null,
                client_email: clientEmail,
                page_url: (context as any)?.pageUrl || null,
                page_title: (context as any)?.pageTitle || null,
                referrer: (context as any)?.referrer || null,
                device: (context as any)?.device || null,
                user_agent: (context as any)?.userAgent || null,
              },
              current_handler: currentAutomationId ? "ai" : "human",
              current_automation_id: currentAutomationId,
              assigned_to: assignedTo,
              department_id: traySettings?.default_department_id || null,
              status: "novo_contato",
            })
            .select("id")
            .single();

          if (convError || !newConv) {
            console.error(`[${errorRef}] Failed to create widget conversation:`, convError);
            return new Response(
              JSON.stringify({ error: "Failed to create conversation", ref: errorRef }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          conversationId = newConv.id;
          console.log(
            `[AI Chat] Created new widget conversation: ${conversationId} for tenant: ${validatedLawFirmId}, handler: ${handlerType}, client: ${clientId}`
          );
        }
      }
    }

    // automationId is REQUIRED for AI behavior
    // For widget conversations without automation (human mode), save message and return
    if (!automationId) {
      // If this is a widget conversation without automation, provide a fallback message
      if (isWidgetConversation && conversationId) {
        console.log(`[${errorRef}] Widget conversation without automation (human mode) - saving message`);
        
        // Save the user message to the conversation
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: message,
          sender_type: "client",
          is_from_me: false,
          message_type: "text",
          status: "delivered"
        });
        
        // Update conversation last_message_at
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);
        
        // Check if there are any previous assistant messages (to avoid duplicate system messages)
        const { data: existingMessages } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("is_from_me", true)
          .limit(1);
        
        // Only send welcome message on first contact
        if (!existingMessages || existingMessages.length === 0) {
          const systemMessage = "Olá! Obrigado por entrar em contato. Nossa equipe irá atendê-lo em breve. Por favor, aguarde.";
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: systemMessage,
            sender_type: "system",
            is_from_me: true,
            message_type: "text",
            status: "delivered"
          });
          
          return new Response(
            JSON.stringify({ 
              response: systemMessage,
              conversationId,
              messageId: null,
              status: "awaiting_agent"
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // For subsequent messages, just acknowledge without a bot response
        return new Response(
          JSON.stringify({ 
            conversationId,
            messageId: null,
            status: "awaiting_agent"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error(`[${errorRef}] automationId is required for proper AI behavior`);
      return new Response(
        JSON.stringify({ error: "AI agent configuration required", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent configuration - the ONLY source of behavior
    const { data: automation, error: automationError } = await supabase
      .from("automations")
      .select("id, ai_prompt, ai_temperature, name, law_firm_id, version, updated_at, trigger_config, notify_on_transfer, trigger_type, scheduling_enabled")
      .eq("id", automationId)
      .eq("is_active", true)
      .single();

    if (automationError || !automation) {
      console.error(`[${errorRef}] Agent not found or inactive:`, automationId);
      return new Response(
        JSON.stringify({ error: "AI agent not available", ref: errorRef }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL SECURITY CHECK: Validate tenant isolation
    const contextLawFirmId = context?.lawFirmId;
    if (contextLawFirmId && automation.law_firm_id !== contextLawFirmId) {
      console.error(`[${errorRef}] SECURITY VIOLATION - Cross-tenant automation execution blocked`);
      return new Response(
        JSON.stringify({ error: "Access denied", ref: errorRef }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use ONLY the agent's configured prompt
    let systemPrompt = (automation as any).ai_prompt;
    let temperature = 0.7;
    if ((automation as any).ai_temperature !== null) {
      temperature = (automation as any).ai_temperature;
    }
    const automationName = (automation as any).name;
    
    // Get law_firm_id from automation (for usage tracking)
    const agentLawFirmId = (automation as any).law_firm_id;

    // Get notify_on_transfer setting (default false)
    const notifyOnTransfer = (automation as any).notify_on_transfer ?? false;

    // Check if this agent has scheduling capabilities enabled AND Agenda Pro is active
    const triggerType = (automation as any).trigger_type;
    const schedulingEnabled = (automation as any).scheduling_enabled === true;
    
    // Also check if Agenda Pro is enabled for this law firm
    let agendaProEnabled = false;
    if (schedulingEnabled || triggerType === "scheduling") {
      const { data: agendaSettings } = await supabase
        .from("agenda_pro_settings")
        .select("is_enabled")
        .eq("law_firm_id", agentLawFirmId)
        .maybeSingle();
      agendaProEnabled = agendaSettings?.is_enabled === true;
    }
    
    const isSchedulingAgent = (triggerType === "scheduling" || schedulingEnabled) && agendaProEnabled;

    // Extract AI role from trigger_config for audit purposes
    const triggerConfig = (automation as any).trigger_config as Record<string, unknown> | null;
    const aiRole = (triggerConfig?.role as string) || (isSchedulingAgent ? 'scheduling' : 'default');

    if (!systemPrompt) {
      console.error(`[${errorRef}] Agent has no prompt configured:`, automationId);
      return new Response(
        JSON.stringify({ error: "AI agent not properly configured", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add critical scheduling rules for scheduling agents with current Brazil date/time
    if (isSchedulingAgent) {
      // Get current date/time in Brazil timezone for accurate date calculations
      const nowBrazil = new Date();
      const brazilDateFormatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      const brazilTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit"
      });
      
      const currentDateBrazil = brazilDateFormatter.format(nowBrazil);
      const currentTimeBrazil = brazilTimeFormatter.format(nowBrazil);
      
      // Calculate ISO date for reference
      const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      const currentIsoDate = isoDateFormatter.format(nowBrazil);
      
      // Get Brazil-accurate date for day calculations
      const brazilNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      
      // Calculate dates for next 7 days dynamically
      const weekdayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
      const upcomingDays: string[] = [];
      
      for (let i = 1; i <= 7; i++) {
        const futureDate = new Date(brazilNow);
        futureDate.setDate(futureDate.getDate() + i);
        const futureDayOfWeek = futureDate.getDay();
        const futureDay = String(futureDate.getDate()).padStart(2, '0');
        const futureMonth = String(futureDate.getMonth() + 1).padStart(2, '0');
        upcomingDays.push(`   - "${weekdayNames[futureDayOfWeek]}" = ${futureDay}/${futureMonth}`);
      }
      
      const dynamicExamples = upcomingDays.join("\n");
      
      console.log(`[Scheduling] Injecting Brazil date/time: ${currentDateBrazil}, ${currentTimeBrazil} (ISO: ${currentIsoDate})`);
      console.log(`[Scheduling] Upcoming days reference:\n${dynamicExamples}`);
      
      systemPrompt += `

### DATA E HORA ATUAIS (Brasília) ###
Hoje é ${currentDateBrazil}, ${currentTimeBrazil}.
Data em formato ISO: ${currentIsoDate}

### PRÓXIMOS DIAS (Referência para Cálculo) ###
${dynamicExamples}

### REGRAS CRÍTICAS DE AGENDAMENTO ###
1. Ao listar serviços com list_services, você DEVE apresentar ABSOLUTAMENTE TODOS os serviços retornados.
2. NUNCA resuma, agrupe ou omita serviços. Cada um deve ser mencionado individualmente.
3. Use o campo 'services_list_for_response' da resposta para garantir que a lista esteja completa.
4. O cliente tem o direito de conhecer TODAS as opções disponíveis.
5. PROIBIDO REPETIR SERVIÇOS: 
   - Chame list_services APENAS UMA VEZ por conversa
   - Se o cliente já conhece os serviços (você já listou antes), NÃO chame list_services novamente
   - Na confirmação final, mencione APENAS o serviço escolhido pelo nome (ex: "Head Spa"), NÃO liste todos
   - Use o service_id que você já obteve anteriormente na memória da conversa
6. CÁLCULO DE DATAS: Use a referência "PRÓXIMOS DIAS" acima. NÃO calcule manualmente - consulte a lista.
7. SEMPRE confirme a data exata (dia da semana + data numérica) ANTES de criar o agendamento.
8. VERIFICAÇÃO: Compare o dia da semana solicitado com a lista "PRÓXIMOS DIAS" antes de chamar book_appointment.
9. VALIDAÇÃO DE CONSISTÊNCIA: Se o cliente mencionar um dia da semana E uma data numérica que NÃO correspondem (ex: "quinta-feira 07/02" quando 07/02 é sábado):
   - NÃO confirme o agendamento
   - Informe o erro de forma clara e educada: "Identifiquei uma inconsistência: 07/02 é sábado."
   - Ofereça as duas opções corretas: "Você gostaria de agendar para: sábado, 07/02 ou quinta-feira, 12/02?"
   - Só prossiga após o cliente escolher uma opção válida
10. CONFIRMAÇÃO OBRIGATÓRIA: Antes de chamar book_appointment, SEMPRE confirme com o cliente:
   - Data numérica (ex: 12/02)
   - Dia da semana correspondente (ex: quinta-feira)
   - Horário (ex: 11:00)
   Exemplo: "Confirmo: quinta-feira, 12/02 às 11:00. Correto?"
11. PARÂMETRO expected_weekday: Ao chamar book_appointment, SEMPRE informe o parâmetro expected_weekday com o dia da semana confirmado (ex: "quinta-feira"). O backend validará a consistência.
12. MEMÓRIA DE SERVIÇOS: Se você JÁ listou os serviços nesta conversa (verifique no histórico de mensagens), você JÁ POSSUI os service_ids na sua memória. NÃO chame list_services novamente. Quando o cliente confirmar o agendamento, vá direto para book_appointment usando o service_id que você obteve anteriormente.
`;
    }

    // ========================================================================
    // PROCESS MENTIONS: Replace @mentions in the prompt with actual values
    // ========================================================================
    if (agentLawFirmId && systemPrompt) {
      // Fetch law_firm data for mention replacement
      const { data: lawFirmData } = await supabase
        .from("law_firms")
        .select("name, phone, email, address, instagram, facebook, website, business_hours, timezone")
        .eq("id", agentLawFirmId)
        .single();
      
      if (lawFirmData) {
        // Process mentions
        const mentionReplacements: Record<string, string> = {
          "@Nome da empresa": lawFirmData.name || "",
          "@Endereço": lawFirmData.address || "",
          "@Telefone": lawFirmData.phone || "",
          "@Email": lawFirmData.email || "",
          "@Instagram": lawFirmData.instagram || "",
          "@Facebook": lawFirmData.facebook || "",
          "@Website": lawFirmData.website || "",
        };
        
        // Process @Horário comercial
        if (lawFirmData.business_hours) {
          const businessHours = lawFirmData.business_hours as Record<string, any>;
          const dayNames: Record<string, string> = {
            monday: "Segunda",
            tuesday: "Terça",
            wednesday: "Quarta",
            thursday: "Quinta",
            friday: "Sexta",
            saturday: "Sábado",
            sunday: "Domingo"
          };
          
          const formattedHours = Object.entries(businessHours)
            .filter(([_, config]) => (config as any)?.enabled)
            .map(([day, config]) => {
              const cfg = config as any;
              return `${dayNames[day] || day}: ${cfg.start || "09:00"} - ${cfg.end || "18:00"}`;
            })
            .join(", ");
          
          mentionReplacements["@Horário comercial"] = formattedHours || "Horário não configurado";
        } else {
          mentionReplacements["@Horário comercial"] = "Horário não configurado";
        }
        
        // Process @Data atual and @Hora atual
        const now = new Date();
        const brazilFormatter = new Intl.DateTimeFormat("pt-BR", {
          timeZone: lawFirmData.timezone || "America/Sao_Paulo",
          dateStyle: "full"
        });
        const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
          timeZone: lawFirmData.timezone || "America/Sao_Paulo",
          timeStyle: "short"
        });
        
        mentionReplacements["@Data atual"] = brazilFormatter.format(now);
        mentionReplacements["@Hora atual"] = timeFormatter.format(now);
        
        // Apply all replacements
        for (const [mention, value] of Object.entries(mentionReplacements)) {
          if (systemPrompt.includes(mention)) {
            systemPrompt = systemPrompt.replace(new RegExp(mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
          }
        }
        
        // Also handle the structured format
        const structuredReplacements: Record<string, string> = {
          "@empresa:Nome": lawFirmData.name || "",
          "@empresa:Endereço": lawFirmData.address || "",
          "@empresa:Telefone": lawFirmData.phone || "",
          "@empresa:Email": lawFirmData.email || "",
          "@empresa:Instagram": lawFirmData.instagram || "",
          "@empresa:Facebook": lawFirmData.facebook || "",
          "@empresa:Website": lawFirmData.website || "",
          "@empresa:Horário comercial": mentionReplacements["@Horário comercial"],
        };
        
        for (const [mention, value] of Object.entries(structuredReplacements)) {
          if (systemPrompt.includes(mention)) {
            systemPrompt = systemPrompt.replace(new RegExp(mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
          }
        }
      }
      
      // Process client context mentions if available
      if (context?.clientName) {
        systemPrompt = systemPrompt.replace(/@Nome do cliente/g, context.clientName);
        systemPrompt = systemPrompt.replace(/@cliente:Nome/g, context.clientName);
      }
      
      // Process template mentions
      const templateMentionPattern = /@template:([^\s@]+(?:\s+[^\s@]+)*?)(?=\s*[@\n]|$)/g;
      const templateMatches = systemPrompt.matchAll(templateMentionPattern);
      
      for (const match of templateMatches) {
        const fullMatch = match[0];
        const templateNameRaw = match[1].trim();
        
        const { data: templateData } = await supabase
          .from("templates")
          .select("name, shortcut, content")
          .eq("law_firm_id", agentLawFirmId)
          .eq("is_active", true);
        
        if (templateData && templateData.length > 0) {
          const matchedTemplate = templateData.find(
            (t: any) => 
              t.name.toLowerCase() === templateNameRaw.toLowerCase() ||
              t.shortcut.toLowerCase() === templateNameRaw.toLowerCase() ||
              t.name.toLowerCase().startsWith(templateNameRaw.toLowerCase())
          );
          
          if (matchedTemplate) {
            systemPrompt = systemPrompt.replace(fullMatch, matchedTemplate.content || "");
          }
        }
      }
    }

    // AUDIT LOG
    console.log(`[AI_ISOLATION] ✅ EXECUTION START - Canonical Identity Validated`, JSON.stringify({
      tenant_id: agentLawFirmId,
      ai_id: automation.id,
      ai_name: automationName,
      ai_role: aiRole,
      prompt_version: automation.version,
      conversation_id: conversationId,
      is_widget: isWidgetConversation,
      timestamp: new Date().toISOString(),
    }));

    // ONLY load knowledge bases that are EXPLICITLY LINKED to this agent
    const knowledgeText = await getAgentKnowledge(supabase, automationId);
    if (knowledgeText) {
      console.log(`[AI_ISOLATION] Knowledge base loaded ONLY for agent ${automationId}`);
    }

    // Determine which AI to use - now with global provider selection and fallback
    let useOpenAI = false;
    let openaiModel = "gpt-4o-mini";
    
    // Global AI settings (system-wide)
    const { data: globalSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "ai_openai_model",
        "ai_primary_provider",
        "ai_gemini_api_key",
        "ai_gemini_model",
        "ai_enable_fallback"
      ]);
    
    const getGlobalSetting = (key: string, defaultVal: any): any => {
      const setting = globalSettings?.find((s: any) => s.key === key);
      if (!setting?.value) return defaultVal;
      // Handle JSON strings like '"lovable"' -> 'lovable'
      if (typeof setting.value === "string") {
        try {
          return JSON.parse(setting.value);
        } catch {
          return setting.value;
        }
      }
      return setting.value;
    };
    
    // Global provider configuration
    const globalPrimaryProvider = getGlobalSetting("ai_primary_provider", "lovable");
    const globalGeminiApiKey = getGlobalSetting("ai_gemini_api_key", "");
    const globalGeminiModel = getGlobalSetting("ai_gemini_model", "gemini-2.5-flash");
    const globalEnableFallback = getGlobalSetting("ai_enable_fallback", true);
    
    if (globalSettings) {
      const modelSetting = globalSettings.find((s: any) => s.key === "ai_openai_model");
      if (modelSetting?.value && typeof modelSetting.value === "string") {
        try {
          openaiModel = JSON.parse(modelSetting.value);
        } catch {
          openaiModel = modelSetting.value;
        }
      }
    }
    
    // Per-tenant override (Enterprise only - uses their own OpenAI key)
    if (context?.lawFirmId) {
      const { data: settings } = await supabase
        .from("law_firm_settings")
        .select("ai_provider, ai_capabilities")
        .eq("law_firm_id", context.lawFirmId)
        .maybeSingle();
      
      if (settings?.ai_capabilities) {
        const caps = settings.ai_capabilities as any;
        const iaOpenAI = caps.openai_active ?? (settings.ai_provider === "openai");
        
        // Check for tenant-specific OpenAI model override
        const tenantModel = caps.openai_model;
        if (tenantModel && tenantModel !== "global") {
          openaiModel = tenantModel;
          console.log(`[AI Chat] Using tenant-specific OpenAI model: ${openaiModel}`);
        }
        
        if (iaOpenAI && OPENAI_API_KEY) {
          useOpenAI = true;
          console.log(`[AI Chat] Using OpenAI per-tenant override (model=${openaiModel})`);
        }
      }
    }
    
    console.log(`[AI Chat] Provider config: primary=${globalPrimaryProvider}, gemini_key=${globalGeminiApiKey ? "SET" : "NOT_SET"}, fallback=${globalEnableFallback}`);

    // Build messages array with tool behavior rules for silent transfers
    // When notify_on_transfer is disabled, we inject explicit instructions to prevent AI from mentioning transfers
    const toolBehaviorRules = notifyOnTransfer ? "" : `

### COMPORTAMENTO EM TRANSFERÊNCIAS SILENCIOSAS ###
ATENÇÃO: O modo "Notificar cliente ao transferir" está DESATIVADO para este agente.
Quando você executar qualquer ação de transferência (departamento, responsável, IA):
- NÃO diga ao cliente que ele será transferido
- NÃO mencione departamentos ou nomes de atendentes
- NÃO use frases como "vou transferir", "encaminhando", "outro atendente vai te atender"
- Continue a conversa naturalmente OU encerre com despedida simples
- Se o tool result contiver "[AÇÃO INTERNA", "[AÇÃO SILENCIOSA" ou "notify_client: false", é OBRIGATÓRIO silenciar

Exemplo de resposta CORRETA após transferência silenciosa:
"Foi um prazer ajudá-lo! Qualquer dúvida, estamos à disposição."

Exemplo de resposta ERRADA (nunca faça isso):
"Vou transferir sua consulta para o departamento adequado."
`;

    // CRM Tool Execution Rules - ensures AI executes ALL mentioned actions
    const toolExecutionRules = `

### REGRAS DE EXECUÇÃO DE AÇÕES CRM (OBRIGATÓRIO) ###

Quando o seu prompt de configuração mencionar ações usando os formatos:
- @status:NomeDoStatus
- @etiqueta:NomeTag ou @tag:NomeTag
- @departamento:NomeDept
- @responsavel:NomeResp ou @responsavel:IA:NomeAgente

Você DEVE chamar as tools correspondentes para executar essas ações:

| Mention no Prompt        | Tool a Chamar           | Parâmetro               |
|--------------------------|-------------------------|-------------------------|
| @status:Desqualificado   | change_status           | status_name             |
| @etiqueta:10 anos ++     | add_tag                 | tag_name                |
| @departamento:Finalizado | transfer_to_department  | department_name         |
| @responsavel:Caio        | transfer_to_responsible | responsible_name        |

⚠️ REGRA CRÍTICA: 
Se uma situação no seu prompt indica múltiplas ações (ex: mudar status + adicionar tag + transferir),
você DEVE chamar TODAS as tools correspondentes. NÃO omita nenhuma ação.

Exemplo: Se o prompt diz "Adicione o status @status:Desqualificado e a tag @etiqueta:Não tem direito a revisão"
→ Você DEVE chamar change_status E add_tag (2 tools).

### REGRA DE EXECUÇÃO DE STATUS (OBRIGATÓRIO) ###

Quando uma situação descrita no seu prompt de configuração indicar um status específico usando @status:X:

1. ANALISE a situação ANTES de decidir qual status usar
2. IDENTIFIQUE qual condição do seu prompt foi atendida
3. EXECUTE change_status com o status EXATO mencionado naquela condição
4. NÃO use status intermediários - vá direto para o status correto

REGRA CRÍTICA DE CONSISTÊNCIA:
- Se o prompt diz "quando situação A → @status:X" e a situação A ocorreu
- Você DEVE chamar change_status(status_name="X")
- NÃO chame change_status com outro status e depois tente corrigir

EXEMPLO GENÉRICO:
- Seu prompt diz: "quando condição Y ocorrer, use @status:Z"
- Cliente satisfez a condição Y
- ✅ CORRETO: change_status(status_name="Z")
- ❌ ERRADO: change_status(status_name="W") e depois change_status(status_name="Z")

IMPORTANTE: As regras de negócio específicas (quando usar qual status) estão no SEU PROMPT.
Esta regra apenas garante que você EXECUTE as ações que seu prompt determina.

`;

    // AUTO-INJECT: Current date/time context for ALL agents
    // This ensures every AI agent knows the current date for accurate reasoning
    const autoInjectNow = new Date();
    
    // Fetch timezone for the law firm (agentLawFirmId is available in outer scope)
    let autoInjectTimezone = "America/Sao_Paulo";
    if (agentLawFirmId) {
      const { data: tzData } = await supabase
        .from("law_firms")
        .select("timezone")
        .eq("id", agentLawFirmId)
        .maybeSingle();
      if (tzData?.timezone) {
        autoInjectTimezone = tzData.timezone;
      }
    }
    
    const autoDateFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: autoInjectTimezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const autoTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: autoInjectTimezone,
      hour: "2-digit",
      minute: "2-digit"
    });
    
    const autoCurrentDate = autoDateFormatter.format(autoInjectNow);
    const autoCurrentTime = autoTimeFormatter.format(autoInjectNow);
    
    // Extract current year for explicit calculation examples
    const currentYearNumber = autoInjectNow.toLocaleString("en-US", { 
      timeZone: autoInjectTimezone, 
      year: "numeric" 
    });
    const currentYear = parseInt(currentYearNumber, 10);
    
    const dateContextPrefix = `📅 CONTEXTO TEMPORAL (SEMPRE CONSIDERE):
Data de hoje: ${autoCurrentDate}
Hora atual: ${autoCurrentTime}
Fuso horário: ${autoInjectTimezone}
ANO ATUAL: ${currentYear}

### REGRA DE CÁLCULO DE PRAZOS (OBRIGATÓRIA) ###

Para verificar se uma data/ano está DENTRO de um prazo de X anos:
1. Calcule: ANO_ATUAL (${currentYear}) - ANO_MENCIONADO = diferença
2. Se diferença > X → FORA DO PRAZO (não qualifica)
3. Se diferença <= X → DENTRO DO PRAZO (qualifica)

EXEMPLOS PARA PRAZO DE 10 ANOS (referência ${currentYear}):
- ${currentYear - 12}: ${currentYear} - ${currentYear - 12} = 12 → FORA (12 > 10)
- ${currentYear - 11}: ${currentYear} - ${currentYear - 11} = 11 → FORA (11 > 10)
- ${currentYear - 10}: ${currentYear} - ${currentYear - 10} = 10 → DENTRO (10 = 10)
- ${currentYear - 9}: ${currentYear} - ${currentYear - 9} = 9 → DENTRO (9 < 10)

ATENÇÃO: Sempre faça o cálculo ANTES de responder sobre prazos. NÃO assuma que qualquer ano está "dentro" sem calcular.

---

`;

    const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText + toolBehaviorRules + toolExecutionRules;
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: fullSystemPrompt }
    ];

    // Add context about conversation summary if available
    if (isValidUUID(conversationId)) {
      const summary = await generateSummaryIfNeeded(supabase, conversationId, LOVABLE_API_KEY);
      if (summary) {
        messages.push({
          role: "system",
          content: `RESUMO DA CONVERSA ANTERIOR:\n${summary}`
        });
      }
    }

    // Add previous messages from context OR fetch from database for widget conversations
    if (context?.previousMessages && context.previousMessages.length > 0) {
      messages.push(...context.previousMessages);
    } else if (isValidUUID(conversationId)) {
      // Fetch conversation history from database for widget/site conversations
      // Get last 35 messages to provide context without overloading the model
      const { data: historyMessages, error: historyError } = await supabase
        .from("messages")
        .select("content, is_from_me, sender_type, created_at")
        .eq("conversation_id", conversationId)
        .neq("content", message) // Exclude the current message being processed
        .order("created_at", { ascending: false })
        .limit(35);
      
      // Reverse to get chronological order (oldest first)
      if (historyMessages) {
        historyMessages.reverse();
      }
      
      if (!historyError && historyMessages && historyMessages.length > 0) {
        console.log(`[AI Chat] Loaded ${historyMessages.length} previous messages for context`);
        
        // Detect if services were already listed in this conversation
        const servicesAlreadyListed = historyMessages.some((msg: any) => 
          msg.is_from_me && 
          msg.content?.includes("serviços disponíveis") &&
          (msg.content?.includes("• ") || msg.content?.includes("- ") || msg.content?.includes("1.") || msg.content?.includes("1)"))
        );
        
        if (servicesAlreadyListed) {
          console.log(`[AI Chat] Services already listed - fetching service IDs to inject into context`);
          
          // Fetch current services to inject their IDs into context
          const { data: cachedServices, error: servicesFetchError } = await supabase
            .from("agenda_pro_services")
            .select("id, name")
            .eq("law_firm_id", agentLawFirmId)
            .eq("is_active", true)
            .eq("is_public", true)
            .order("position", { ascending: true });
          
          if (!servicesFetchError && cachedServices && cachedServices.length > 0) {
            const serviceIdList = cachedServices.map((s, i) => `${i + 1}. ${s.name} → service_id: "${s.id}"`).join("\n");
            console.log(`[AI Chat] Injecting ${cachedServices.length} service IDs into context`);
            
            messages.push({
              role: "system",
              content: `MEMÓRIA DE SERVIÇOS (NÃO chame list_services novamente):

Os serviços já foram apresentados ao cliente. Aqui estão os service_ids para sua referência imediata:

${serviceIdList}

INSTRUÇÃO CRÍTICA: Use esses service_ids DIRETAMENTE ao chamar book_appointment. NÃO chame list_services - você já tem todos os IDs que precisa acima.`
            });
          } else {
            // Fallback: just inject note without IDs
            messages.push({
              role: "system",
              content: "NOTA: Os serviços já foram listados anteriormente. NÃO chame list_services novamente."
            });
          }
        }
        
        for (const msg of historyMessages) {
          // Skip empty messages
          if (!msg.content?.trim()) continue;
          
          // Map to assistant/user roles
          const role = msg.is_from_me ? "assistant" : "user";
          
          // Wrap user messages for injection protection
          const content = role === "user" ? wrapUserInput(msg.content) : msg.content;
          
          messages.push({ role, content });
        }
      }
    }

    // Add current message (wrapped for injection protection)
    // Handle documents and images differently:
    // - PDFs: extract text and send as text (gateway doesn't support PDF in image_url)
    // - Images: use image_url multimodal (gateway supports image MIME types)
    if (context?.documentBase64 && context?.documentMimeType?.includes('pdf')) {
      // PDF: extract text and send as text context
      const docFileName = context.documentFileName || 'documento.pdf';
      const pdfText = extractTextFromPdfBase64(context.documentBase64);
      console.log(`[AI Chat] PDF text extraction for: ${docFileName} (extracted ${pdfText.length} chars)`);
      messages.push({
        role: "user",
        content: wrapUserInput(
          `[Cliente enviou o documento: ${docFileName}]\n` +
          `Conteudo extraido do PDF:\n---\n${pdfText}\n---\n` +
          (message ? message : `Analise o conteudo deste documento.`)
        ),
      });
    } else if (context?.documentBase64 && context?.documentMimeType?.startsWith('image/')) {
      // Image: use multimodal image_url (supported by gateway)
      const imgMsg = message || '[Cliente enviou uma imagem]';
      console.log(`[AI Chat] Building multimodal image message (${context.documentMimeType}, ${(context.documentBase64.length / 1024).toFixed(0)}KB)`);
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${context.documentMimeType};base64,${context.documentBase64}` } },
          { type: "text", text: wrapUserInput(imgMsg) },
        ] as any,
      });
    } else {
      messages.push({ role: "user", content: wrapUserInput(message) });
    }

    // Get available tools with tenant-specific context injected
    // This ensures the AI knows exactly which departments/statuses/tags are available
    const crmToolsWithContext = await getCrmToolsWithContext(supabase, agentLawFirmId);
    
    const tools: any[] = [
      ...crmToolsWithContext, // CRM tools with injected context
      ...(isSchedulingAgent ? SCHEDULING_TOOLS : []), // Scheduling tools if enabled
      TEMPLATE_TOOL // Template sending tool
    ];

    // Call AI with provider selection and fallback logic
    let aiResponse: string;
    let usedTokens = 0;
    let usedProvider = "lovable";

    // Helper function to call Lovable AI
    const callLovableAI = async (body: Record<string, unknown>): Promise<Response> => {
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, model: "google/gemini-2.5-flash" }),
      });
    };

    // Helper function to call Gemini directly (user's own API key)
    const callGeminiDirect = async (apiKey: string, model: string, body: Record<string, unknown>): Promise<Response> => {
      return fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, model }),
      });
    };

    // Helper function to call OpenAI (tenant's own API key - Enterprise)
    const callOpenAI = async (body: Record<string, unknown>): Promise<Response> => {
      return fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, model: openaiModel }),
      });
    };

    const aiRequestBody: Record<string, unknown> = {
      messages,
      temperature,
    };

    if (tools.length > 0) {
      aiRequestBody.tools = tools;
      aiRequestBody.tool_choice = "auto";
    }

    let response: Response;

    try {
      // If tenant has their own OpenAI key (Enterprise), use that directly
      if (useOpenAI) {
        console.log(`[AI Chat] Using tenant's OpenAI key (Enterprise)`);
        response = await callOpenAI(aiRequestBody);
        usedProvider = "openai-enterprise";
      }
      // Otherwise use global provider configuration
      else if (globalPrimaryProvider === "gemini" && globalGeminiApiKey) {
        console.log(`[AI Chat] Using Gemini as primary (global config)`);
        response = await callGeminiDirect(globalGeminiApiKey, globalGeminiModel, aiRequestBody);
        usedProvider = "gemini";
      } else {
        console.log(`[AI Chat] Using Lovable AI as primary (global config)`);
        response = await callLovableAI(aiRequestBody);
        usedProvider = "lovable";
      }

      // Check for rate limit or payment errors - trigger fallback
      if (!response.ok && globalEnableFallback && !useOpenAI) {
        const status = response.status;
        if (status === 429 || status === 402 || status >= 500) {
          const errorText = await response.text();
          console.log(`[AI Chat] Primary ${usedProvider} failed (${status}): ${errorText.substring(0, 200)}, trying fallback...`);
          
          // Switch to fallback provider
          if (usedProvider === "lovable" && globalGeminiApiKey) {
            console.log(`[AI Chat] Fallback to Gemini (${globalGeminiModel})`);
            response = await callGeminiDirect(globalGeminiApiKey, globalGeminiModel, aiRequestBody);
            usedProvider = "gemini-fallback";
          } else if (usedProvider === "gemini") {
            console.log(`[AI Chat] Fallback to Lovable AI`);
            response = await callLovableAI(aiRequestBody);
            usedProvider = "lovable-fallback";
          }
        }
      }

      // 400 error with multimodal content: retry with text-only (strip image_url)
      if (!response.ok && response.status === 400) {
        const lastMsg = aiRequestBody.messages && Array.isArray(aiRequestBody.messages) 
          ? (aiRequestBody.messages as any[])[(aiRequestBody.messages as any[]).length - 1] 
          : null;
        if (lastMsg && Array.isArray(lastMsg.content)) {
          const errorText = await response.text();
          console.log(`[AI Chat] 400 error with multimodal content, retrying text-only. Error: ${errorText.substring(0, 200)}`);
          
          // Extract text parts only, discard image_url parts
          const textParts = lastMsg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text);
          const textOnly = textParts.join('\n') || wrapUserInput(message || '[Cliente enviou uma mídia]');
          lastMsg.content = textOnly;
          
          // Retry with text-only
          if (useOpenAI) {
            response = await callOpenAI(aiRequestBody);
          } else if (usedProvider.includes("gemini")) {
            response = await callGeminiDirect(globalGeminiApiKey!, globalGeminiModel, aiRequestBody);
          } else {
            response = await callLovableAI(aiRequestBody);
          }
          usedProvider += "-text-fallback";
        }
      }
    } catch (networkError) {
      // Network error - try fallback if enabled
      console.error(`[AI Chat] Network error with primary provider:`, networkError);
      
      if (globalEnableFallback && !useOpenAI) {
        console.log(`[AI Chat] Network error, trying fallback...`);
        if (globalPrimaryProvider === "lovable" && globalGeminiApiKey) {
          response = await callGeminiDirect(globalGeminiApiKey, globalGeminiModel, aiRequestBody);
          usedProvider = "gemini-fallback";
        } else if (globalPrimaryProvider === "gemini") {
          response = await callLovableAI(aiRequestBody);
          usedProvider = "lovable-fallback";
        } else {
          throw networkError;
        }
      } else {
        throw networkError;
      }
    }

    console.log(`[AI Chat] Response from provider: ${usedProvider}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Chat] AI API error (${usedProvider}):`, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error", ref: errorRef, provider: usedProvider }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data = await response.json();
    usedTokens = data.usage?.total_tokens || 0;

    // Handle tool calls in a loop
    let iterations = 0;
    const maxIterations = 5;

    while (data.choices?.[0]?.message?.tool_calls && iterations < maxIterations) {
      iterations++;
      const toolCalls = data.choices[0].message.tool_calls;
      
      // Add assistant message with tool calls
      messages.push(data.choices[0].message);

      // Execute each tool call
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolResult: string;

        // Route to appropriate tool executor
        if (["transfer_to_department", "change_status", "add_tag", "remove_tag", "transfer_to_responsible"].includes(toolName)) {
          toolResult = await executeCrmTool(
            supabase, agentLawFirmId, conversationId, context?.clientId,
            automationId, automationName, { name: toolName, arguments: toolCall.function.arguments },
            notifyOnTransfer
          );
        } else if (["list_services", "get_available_slots", "book_appointment", "list_client_appointments", "reschedule_appointment", "cancel_appointment", "confirm_appointment"].includes(toolName)) {
          toolResult = await executeSchedulingTool(
            supabase, supabaseUrl, supabaseKey, agentLawFirmId, conversationId,
            context?.clientId, { name: toolName, arguments: toolCall.function.arguments }
          );
        } else if (toolName === "send_template") {
          toolResult = await executeTemplateTool(
            supabase, agentLawFirmId, conversationId,
            { name: toolName, arguments: toolCall.function.arguments }
          );
        } else {
          toolResult = JSON.stringify({ error: "Unknown tool" });
        }

        // Add tool result to messages
        messages.push({
          role: "tool",
          content: toolResult,
          // @ts-ignore
          tool_call_id: toolCall.id
        });
      }

      // Call AI again with tool results - use the same provider that was selected
      const followUpBody = {
        ...aiRequestBody,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      };
      
      let followUpResponse: Response;
      
      // Use the same provider path that was initially selected
      if (usedProvider.startsWith("openai")) {
        followUpResponse = await callOpenAI(followUpBody);
      } else if (usedProvider.includes("gemini")) {
        followUpResponse = await callGeminiDirect(globalGeminiApiKey, globalGeminiModel, followUpBody);
      } else {
        followUpResponse = await callLovableAI(followUpBody);
      }

      if (!followUpResponse.ok) {
        const errorText = await followUpResponse.text();
        console.error(`[AI Chat] Follow-up AI error:`, errorText);
        break;
      }

      data = await followUpResponse.json();
      usedTokens += data.usage?.total_tokens || 0;
    }

    // Extract final response
    aiResponse = data.choices?.[0]?.message?.content || "";

    if (!aiResponse) {
      console.error(`[${errorRef}] Empty AI response`);
      aiResponse = "Desculpe, não consegui processar sua mensagem. Por favor, tente novamente.";
    }

    // Split AI response into paragraphs for better readability (like WhatsApp)
    // This prevents sending one large block of text
    const splitIntoParagraphs = (text: string): string[] => {
      // First try: split by double newlines (preferred natural paragraph breaks)
      let paragraphs = text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
      
      // If we got good paragraphs, return them
      if (paragraphs.length > 1) {
        return paragraphs;
      }
      
      // Second try: split by single newlines (common in some AI responses)
      paragraphs = text
        .split(/\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
      
      if (paragraphs.length > 1) {
        return paragraphs;
      }
      
      // Third try: if text is too long (>400 chars), split by sentences
      const trimmedText = text.trim();
      if (trimmedText.length > 400) {
        // Split by sentence-ending punctuation followed by space
        const sentences = trimmedText
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        if (sentences.length > 1) {
          // Group sentences into chunks of ~200-300 chars for readability
          const chunks: string[] = [];
          let currentChunk = '';
          
          for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > 300 && currentChunk.length > 0) {
              chunks.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
            }
          }
          
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          
          if (chunks.length > 1) {
            return chunks;
          }
        }
      }
      
      // Fallback: return original text as single message
      return [trimmedText];
    };

    const sourceUpper = (source || '').toUpperCase();
    const isWebSource = ['WIDGET', 'TRAY', 'SITE', 'WEB'].includes(sourceUpper);
    
    const messageParts = splitIntoParagraphs(aiResponse);
    console.log(`[AI Chat] Split response into ${messageParts.length} parts (source=${sourceUpper})`);

    // Save messages to database if we have a valid conversation
    if (isValidUUID(conversationId)) {
      // Save user message ONLY if not already saved (skip for evolution-webhook calls)
      // evolution-webhook already saves the message before calling ai-chat
      const skipSaveUserMessage = context?.skipSaveUserMessage === true;
      
      if (!skipSaveUserMessage) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: message,
          sender_type: "client",
          is_from_me: false,
          message_type: "text",
          status: "delivered"
        });
      }

      // For WhatsApp sources, skip saving AI response here
      // evolution-webhook will save AFTER sending to WhatsApp to ensure proper sync
      const skipSaveAIResponse = context?.skipSaveAIResponse === true;

      // Save each AI response part as a separate message (only for web sources)
      let savedMessageId: string | null = null;
      if (!skipSaveAIResponse) {
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          const { data: savedMessage } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            law_firm_id: agentLawFirmId,
            content: part,
            sender_type: "ai",
            is_from_me: true,
            message_type: "text",
            status: "delivered",
            ai_generated: true,
            ai_agent_id: automationId,
            ai_agent_name: automationName
          }).select("id").single();
          
          if (i === messageParts.length - 1) {
            savedMessageId = savedMessage?.id || null;
          }
          
          // Small delay between messages for natural typing feel
          if (i < messageParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }

      // Update conversation last_message_at AND unarchive if archived
      // This ensures archived widget conversations are restored when client sends new message
      await supabase
        .from("conversations")
        .update({ 
          last_message_at: new Date().toISOString(),
          n8n_last_response_at: new Date().toISOString(),
          // Clear archived state - conversation should reappear in active list
          archived_at: null,
          archived_reason: null,
          archived_next_responsible_type: null,
          archived_next_responsible_id: null
        })
        .eq("id", conversationId);

      // Track AI usage - record unique conversation per billing period
      if (agentLawFirmId && automationId) {
        await recordAIConversationUsage(
          supabase,
          agentLawFirmId,
          conversationId,
          automationId,
          automationName,
          source || 'unknown'
        );
      }

      // For web sources, ALWAYS return fragments array so widget can add them individually
      // This prevents duplication issues with polling sync (even for single messages)
      if (isWebSource) {
        return new Response(
          JSON.stringify({
            response: aiResponse, // Keep full response for backwards compatibility
            responseParts: messageParts, // Array of fragments for widget to use
            conversationId,
            messageId: savedMessageId,
            tokensUsed: usedTokens
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          response: aiResponse,
          conversationId,
          messageId: savedMessageId,
          tokensUsed: usedTokens
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For widget conversations that don't have a UUID yet
    // ALWAYS return fragments for proper rendering
    if (isWebSource) {
      return new Response(
        JSON.stringify({
          response: aiResponse,
          responseParts: messageParts,
          conversationId,
          tokensUsed: usedTokens
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({
        response: aiResponse,
        conversationId,
        tokensUsed: usedTokens
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${errorRef}] Unhandled error:`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error", ref: errorRef }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});