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
const VALID_SOURCES = ['web', 'whatsapp', 'TRAY', 'api', 'WIDGET'];
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
  };
}

// Google Calendar tools definition for function calling
const CALENDAR_TOOLS = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Verifica os horários disponíveis para agendamento em uma data específica",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data para verificar disponibilidade no formato YYYY-MM-DD (ex: 2025-01-15)"
          }
        },
        required: ["date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Agenda um novo compromisso/consulta no calendário",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Título do evento (ex: 'Consulta com João Silva')"
          },
          start_time: {
            type: "string",
            description: "Data e hora de início no formato ISO 8601 (ex: 2025-01-15T14:00:00)"
          },
          duration_minutes: {
            type: "number",
            description: "Duração em minutos (padrão: 60)"
          },
          description: {
            type: "string",
            description: "Descrição ou observações do evento"
          },
          location: {
            type: "string",
            description: "Local do evento (opcional)"
          }
        },
        required: ["title", "start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description: "Lista os próximos eventos/compromissos agendados",
      parameters: {
        type: "object",
        properties: {
          time_min: {
            type: "string",
            description: "Data inicial no formato ISO 8601"
          },
          time_max: {
            type: "string",
            description: "Data final no formato ISO 8601"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description: "Atualiza/remarca um evento existente",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "ID do evento a ser atualizado"
          },
          title: {
            type: "string",
            description: "Novo título (opcional)"
          },
          start_time: {
            type: "string",
            description: "Nova data/hora de início no formato ISO 8601"
          },
          duration_minutes: {
            type: "number",
            description: "Nova duração em minutos"
          }
        },
        required: ["event_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description: "Cancela/remove um evento do calendário",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "ID do evento a ser cancelado"
          }
        },
        required: ["event_id"]
      }
    }
  }
];

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

// CRM/Internal actions tools definition for function calling
const CRM_TOOLS = [
  {
    type: "function",
    function: {
      name: "transfer_to_department",
      description: "Transfere a conversa/cliente para outro departamento da empresa. Use quando o cliente precisa de atendimento especializado de outro setor.",
      parameters: {
        type: "object",
        properties: {
          department_name: {
            type: "string",
            description: "Nome do departamento para transferir (ex: 'Suporte', 'Comercial', 'Financeiro')"
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
  {
    type: "function",
    function: {
      name: "change_status",
      description: "Altera o status do cliente no funil/CRM. Use para marcar evolução do atendimento.",
      parameters: {
        type: "object",
        properties: {
          status_name: {
            type: "string",
            description: "Nome do novo status (ex: 'Qualificado', 'Proposta Enviada', 'Sucesso')"
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
  {
    type: "function",
    function: {
      name: "add_tag",
      description: "Adiciona uma etiqueta/tag ao cliente para categorização. Use para marcar interesses, perfil ou situações específicas.",
      parameters: {
        type: "object",
        properties: {
          tag_name: {
            type: "string",
            description: "Nome da tag a adicionar (ex: 'VIP', 'Urgente', 'Interessado em X')"
          }
        },
        required: ["tag_name"]
      }
    }
  },
  {
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
  {
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
];

// Scheduling/Appointment tools for intelligent booking
const SCHEDULING_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_services",
      description: "Lista todos os serviços disponíveis para agendamento com nome, duração e preço",
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
      description: "Obtém os horários disponíveis para agendamento em uma data específica, considerando o serviço escolhido e a duração real",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data para verificar disponibilidade no formato YYYY-MM-DD (ex: 2025-01-15)"
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
      description: "Cria um novo agendamento no sistema com todos os dados necessários",
      parameters: {
        type: "object",
        properties: {
          service_id: {
            type: "string",
            description: "ID do serviço a ser agendado"
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
          }
        },
        required: ["service_id", "date", "time", "client_name", "client_phone"]
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

// Check if Google Calendar integration is active for law firm
async function checkCalendarIntegration(supabase: any, lawFirmId: string): Promise<{
  active: boolean;
  permissions: {
    read: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
}> {
  const { data: integration } = await supabase
    .from("google_calendar_integrations")
    .select("is_active, allow_read_events, allow_create_events, allow_edit_events, allow_delete_events")
    .eq("law_firm_id", lawFirmId)
    .eq("is_active", true)
    .maybeSingle();

  if (!integration) {
    return { active: false, permissions: { read: false, create: false, edit: false, delete: false } };
  }

  return {
    active: true,
    permissions: {
      read: integration.allow_read_events ?? false,
      create: integration.allow_create_events ?? false,
      edit: integration.allow_edit_events ?? false,
      delete: integration.allow_delete_events ?? false,
    }
  };
}

// Filter calendar tools based on permissions
function getCalendarTools(permissions: { read: boolean; create: boolean; edit: boolean; delete: boolean }) {
  const tools: typeof CALENDAR_TOOLS = [];
  
  if (permissions.read) {
    tools.push(CALENDAR_TOOLS.find(t => t.function.name === "check_availability")!);
    tools.push(CALENDAR_TOOLS.find(t => t.function.name === "list_events")!);
  }
  if (permissions.create) {
    tools.push(CALENDAR_TOOLS.find(t => t.function.name === "create_event")!);
  }
  if (permissions.edit) {
    tools.push(CALENDAR_TOOLS.find(t => t.function.name === "update_event")!);
  }
  if (permissions.delete) {
    tools.push(CALENDAR_TOOLS.find(t => t.function.name === "delete_event")!);
  }
  
  return tools.filter(Boolean);
}

// Get all available tools (calendar + CRM + scheduling + templates)
function getAllAvailableTools(
  calendarPermissions: { read: boolean; create: boolean; edit: boolean; delete: boolean } | null,
  includeCrmTools: boolean = true,
  includeSchedulingTools: boolean = false,
  includeTemplateTools: boolean = true
) {
  const tools: any[] = [];
  
  // Add calendar tools if integration is active
  if (calendarPermissions) {
    tools.push(...getCalendarTools(calendarPermissions));
  }
  
  // Add scheduling tools if enabled (for scheduling agents)
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

// Execute calendar tool call
async function executeCalendarTool(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  lawFirmId: string,
  conversationId: string,
  clientId: string | undefined,
  automationId: string,
  toolCall: { name: string; arguments: string }
): Promise<string> {
  try {
    const args = JSON.parse(toolCall.arguments);
    
    console.log(`[AI Chat] Executing calendar tool: ${toolCall.name}`, args);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/google-calendar-actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: toolCall.name,
        law_firm_id: lawFirmId,
        conversation_id: conversationId,
        client_id: clientId,
        agent_id: automationId,
        event_data: toolCall.name === "create_event" || toolCall.name === "update_event" || toolCall.name === "delete_event" 
          ? {
              title: args.title,
              start_time: args.start_time,
              end_time: args.end_time,
              duration_minutes: args.duration_minutes || 60,
              description: args.description,
              location: args.location,
              event_id: args.event_id,
            }
          : undefined,
        query: toolCall.name === "check_availability" || toolCall.name === "list_events"
          ? {
              date: args.date,
              time_min: args.time_min,
              time_max: args.time_max,
            }
          : undefined,
      }),
    });

    const result = await response.json();
    
    if (!result.success) {
      return JSON.stringify({ error: result.error || "Falha na operação" });
    }

    // Format response for the AI
    switch (toolCall.name) {
      case "check_availability":
        if (result.available_slots?.length > 0) {
          return JSON.stringify({
            available_slots: result.available_slots,
            message: `Horários disponíveis: ${result.available_slots.join(", ")}`
          });
        }
        return JSON.stringify({ message: "Não há horários disponíveis nesta data." });
        
      case "create_event":
        return JSON.stringify({
          success: true,
          event_id: result.event?.id,
          event_link: result.event?.htmlLink,
          message: `Evento "${args.title}" criado com sucesso para ${args.start_time}`
        });
        
      case "list_events":
        return JSON.stringify({
          events: result.events,
          count: result.events?.length || 0
        });
        
      case "update_event":
        return JSON.stringify({
          success: true,
          message: "Evento atualizado com sucesso"
        });
        
      case "delete_event":
        return JSON.stringify({
          success: true,
          message: "Evento cancelado com sucesso"
        });
        
      default:
        return JSON.stringify(result);
    }
  } catch (error) {
    console.error(`[AI Chat] Calendar tool error:`, error);
    return JSON.stringify({ error: "Erro ao executar ação do calendário" });
  }
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
            message: `[AÇÃO INTERNA - NÃO INFORME AO CLIENTE] Conversa transferida para o departamento ${targetDept.name}. Continue o atendimento normalmente sem mencionar a transferência.`,
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
        
        const targetStatus = statuses?.find((s: any) => 
          s.name.toLowerCase().includes(args.status_name.toLowerCase()) ||
          args.status_name.toLowerCase().includes(s.name.toLowerCase())
        );
        
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
        
        // Find or create tag by name
        let { data: tag } = await supabase
          .from("tags")
          .select("id, name")
          .eq("law_firm_id", lawFirmId)
          .ilike("name", args.tag_name)
          .maybeSingle();
        
        if (!tag) {
          // Create new tag
          const { data: newTag, error } = await supabase
            .from("tags")
            .insert({
              law_firm_id: lawFirmId,
              name: args.tag_name,
              color: "#6366f1" // Default purple
            })
            .select()
            .single();
          
          if (error) {
            return JSON.stringify({ success: false, error: "Erro ao criar tag" });
          }
          tag = newTag;
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
            message: `Cliente já possui a tag ${tag.name}` 
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
              message: `[AÇÃO INTERNA - NÃO INFORME AO CLIENTE] Conversa transferida para ${targetMember.full_name}. Continue a conversa normalmente, ${targetMember.full_name} irá assumir.`,
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

// Execute scheduling tool call
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
    
    switch (toolCall.name) {
      case "list_services": {
        const { data: services, error } = await supabase
          .from("services")
          .select("id, name, description, duration_minutes, price")
          .eq("law_firm_id", lawFirmId)
          .eq("is_active", true)
          .order("name");

        if (error) {
          console.error("[Scheduling] Error listing services:", error);
          return JSON.stringify({ success: false, error: "Erro ao buscar serviços" });
        }

        if (!services || services.length === 0) {
          return JSON.stringify({
            success: true,
            message: "Nenhum serviço cadastrado",
            services: []
          });
        }

        const formattedServices = services.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description || "",
          duration: `${s.duration_minutes} minutos`,
          price: s.price ? `R$ ${s.price.toFixed(2)}` : "Sob consulta"
        }));

        return JSON.stringify({
          success: true,
          message: `${services.length} serviço(s) disponível(is)`,
          services: formattedServices
        });
      }

      case "get_available_slots": {
        const { date, service_id } = args;
        
        if (!date) {
          return JSON.stringify({ success: false, error: "Data é obrigatória" });
        }

        // Get service duration
        let serviceDuration = 60; // Default 60 min
        if (service_id) {
          const { data: service } = await supabase
            .from("services")
            .select("duration_minutes, buffer_before_minutes, buffer_after_minutes, name")
            .eq("id", service_id)
            .eq("law_firm_id", lawFirmId)
            .single();
          
          if (service) {
            serviceDuration = service.duration_minutes + 
              (service.buffer_before_minutes || 0) + 
              (service.buffer_after_minutes || 0);
          }
        }

        // Get business hours for this day
        const { data: lawFirm } = await supabase
          .from("law_firms")
          .select("business_hours")
          .eq("id", lawFirmId)
          .single();

        const businessHours = lawFirm?.business_hours as Record<string, any> || {};
        const requestedDate = new Date(date + "T12:00:00Z"); // Noon to avoid timezone issues
        const dayOfWeek = requestedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
        const dayHours = businessHours[dayOfWeek];

        if (!dayHours?.enabled) {
          return JSON.stringify({
            success: true,
            message: `Não há atendimento neste dia da semana (${dayOfWeek})`,
            available_slots: []
          });
        }

        // Generate all possible slots
        const startHour = parseInt(dayHours.start?.split(":")[0] || "9");
        const startMin = parseInt(dayHours.start?.split(":")[1] || "0");
        const endHour = parseInt(dayHours.end?.split(":")[0] || "18");
        const endMin = parseInt(dayHours.end?.split(":")[1] || "0");
        
        const slots: string[] = [];
        let currentMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        while (currentMinutes + serviceDuration <= endMinutes) {
          const hour = Math.floor(currentMinutes / 60);
          const min = currentMinutes % 60;
          slots.push(`${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
          currentMinutes += 30; // 30 minute intervals
        }

        // Get existing appointments for this date
        const startOfDay = new Date(date + "T00:00:00.000-03:00");
        const endOfDay = new Date(date + "T23:59:59.999-03:00");

        const { data: existingAppointments } = await supabase
          .from("appointments")
          .select("start_time, end_time")
          .eq("law_firm_id", lawFirmId)
          .gte("start_time", startOfDay.toISOString())
          .lte("start_time", endOfDay.toISOString())
          .neq("status", "cancelled");

        // Filter out occupied slots
        const availableSlots = slots.filter((slot) => {
          // IMPORTANT: slot is in Brazil time, need to convert for comparison
          const slotStart = new Date(`${date}T${slot}:00.000-03:00`);
          const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60000);

          const isOccupied = existingAppointments?.some((apt: any) => {
            const aptStart = new Date(apt.start_time);
            const aptEnd = new Date(apt.end_time);
            return slotStart < aptEnd && slotEnd > aptStart;
          });

          return !isOccupied;
        });

        if (availableSlots.length === 0) {
          return JSON.stringify({
            success: true,
            message: "Não há horários disponíveis nesta data",
            available_slots: []
          });
        }

        // Get service info for the response
        const { data: service } = await supabase
          .from("services")
          .select("name, duration_minutes")
          .eq("id", service_id)
          .single();

        // Group by period for better readability
        const morning = availableSlots.filter(s => parseInt(s.split(":")[0]) < 12);
        const afternoon = availableSlots.filter(s => {
          const hour = parseInt(s.split(":")[0]);
          return hour >= 12 && hour < 18;
        });
        const evening = availableSlots.filter(s => parseInt(s.split(":")[0]) >= 18);

        let summary = `📅 Horários disponíveis para ${date}:\n`;
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
          service_name: service?.name,
          duration_minutes: service?.duration_minutes,
          business_hours: `${dayHours.start} às ${dayHours.end}`,
          available_slots_summary: {
            morning: morning.length > 0 ? `${morning[0]} - ${morning[morning.length - 1]}` : null,
            afternoon: afternoon.length > 0 ? `${afternoon[0]} - ${afternoon[afternoon.length - 1]}` : null,
            evening: evening.length > 0 ? `${evening[0]} - ${evening[evening.length - 1]}` : null,
            total: availableSlots.length
          },
          available_slots: availableSlots.length <= 8 ? availableSlots : undefined,
          hint: availableSlots.length > 8 
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

        // Get service details
        const { data: service, error: serviceError } = await supabase
          .from("services")
          .select("id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes")
          .eq("id", service_id)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (serviceError || !service) {
          return JSON.stringify({ success: false, error: "Serviço não encontrado" });
        }

        // Parse date and time - IMPORTANT: time is in Brazil local time (UTC-3)
        const startTime = new Date(`${date}T${time}:00.000-03:00`);
        const totalDuration = service.duration_minutes + 
          (service.buffer_before_minutes || 0) + 
          (service.buffer_after_minutes || 0);
        const endTime = new Date(startTime.getTime() + totalDuration * 60000);
        
        console.log(`[book_appointment] Booking at ${time} Brazil time = ${startTime.toISOString()} UTC`);

        // Check if slot is still available
        const { data: conflicts } = await supabase
          .from("appointments")
          .select("id")
          .eq("law_firm_id", lawFirmId)
          .neq("status", "cancelled")
          .lt("start_time", endTime.toISOString())
          .gt("end_time", startTime.toISOString());

        if (conflicts && conflicts.length > 0) {
          return JSON.stringify({
            success: false,
            error: "Este horário não está mais disponível. Por favor, escolha outro horário."
          });
        }

        // Normalize phone for lookup
        const normalizedPhone = client_phone.replace(/\D/g, '');

        // Try to find existing client by phone, or create/update one
        let agendaClientId = clientId;
        
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id")
          .eq("law_firm_id", lawFirmId)
          .or(`phone.ilike.%${normalizedPhone}%,phone.ilike.%${normalizedPhone.slice(-9)}%`)
          .maybeSingle();

        if (existingClient) {
          agendaClientId = existingClient.id;
          await supabase
            .from("clients")
            .update({
              is_agenda_client: true,
              name: client_name,
              email: client_email || undefined,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingClient.id);
          console.log(`[book_appointment] Updated existing client ${existingClient.id} as agenda client`);
        } else {
          const { data: newClient, error: clientError } = await supabase
            .from("clients")
            .insert({
              law_firm_id: lawFirmId,
              name: client_name,
              phone: client_phone,
              email: client_email || null,
              is_agenda_client: true,
              lgpd_consent: true,
              lgpd_consent_date: new Date().toISOString()
            })
            .select("id")
            .single();

          if (!clientError && newClient) {
            agendaClientId = newClient.id;
            console.log(`[book_appointment] Created new agenda client ${newClient.id}`);
          } else {
            console.error("[book_appointment] Failed to create client:", clientError);
          }
        }

        // Create appointment
        const { data: appointment, error: createError } = await supabase
          .from("appointments")
          .insert({
            law_firm_id: lawFirmId,
            service_id,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            client_id: agendaClientId,
            client_name,
            client_phone,
            client_email: client_email || null,
            notes: notes || null,
            conversation_id: conversationId,
            status: "scheduled",
            created_by: "ai"
          })
          .select()
          .single();

        if (createError) {
          console.error("[Scheduling] Error creating appointment:", createError);
          return JSON.stringify({ success: false, error: "Erro ao criar agendamento" });
        }

        // Try to create Google Calendar event
        try {
          const calendarResponse = await fetch(`${supabaseUrl}/functions/v1/google-calendar-actions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: "create_event",
              law_firm_id: lawFirmId,
              conversation_id: conversationId,
              client_id: clientId,
              event_data: {
                title: `${service.name} - ${client_name}`,
                description: [
                  `Cliente: ${client_name}`,
                  `Telefone: ${client_phone}`,
                  client_email && `E-mail: ${client_email}`,
                  notes && `Obs: ${notes}`
                ].filter(Boolean).join("\n"),
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration_minutes: service.duration_minutes
              }
            }),
          });

          const calendarResult = await calendarResponse.json();
          if (calendarResult.success && calendarResult.event?.id) {
            await supabase
              .from("appointments")
              .update({ google_event_id: calendarResult.event.id })
              .eq("id", appointment.id);
          }
        } catch (e) {
          console.error("[Scheduling] Failed to create Google Calendar event:", e);
        }

        // Get company name for the message
        const { data: lawFirmData } = await supabase
          .from("law_firms")
          .select("name")
          .eq("id", lawFirmId)
          .single();
        const companyName = lawFirmData?.name || "";

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

        return JSON.stringify({
          success: true,
          message: `Olá ${client_name}!\n\nSeu agendamento foi confirmado! ✅\n\n📅 *Data:* ${formattedDate}\n⏰ *Horário:* ${formattedStartTime} às ${formattedEndTime}\n📋 *Serviço:* ${service.name}${companyName ? `\n📍 *Local:* ${companyName}` : ""}\n\nCaso tenha dúvidas, entre em contato.\n\nAguardamos você! 😊`,
          appointment: {
            id: appointment.id,
            service: service.name,
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
        
        let query = supabase
          .from("appointments")
          .select("id, start_time, end_time, status, client_name, client_phone, client_id, conversation_id, service:services(name, duration_minutes)")
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
          console.error("[Scheduling] Error listing appointments:", error);
          return JSON.stringify({ success: false, error: "Erro ao buscar agendamentos" });
        }

        let filteredAppointments = allAppointments || [];
        
        if (clientId) {
          const byClientId = filteredAppointments.filter((apt: any) => apt.client_id === clientId);
          if (byClientId.length > 0) {
            filteredAppointments = byClientId;
          }
        }
        
        if (filteredAppointments.length === 0 || !clientId) {
          const byConversation = (allAppointments || []).filter((apt: any) => apt.conversation_id === conversationId);
          if (byConversation.length > 0) {
            filteredAppointments = byConversation;
          }
        }
        
        if (client_phone && filteredAppointments.length === 0) {
          const normalizedPhone = client_phone.replace(/\D/g, '');
          const byPhone = (allAppointments || []).filter((apt: any) => {
            const aptPhone = apt.client_phone?.replace(/\D/g, '') || '';
            return aptPhone.includes(normalizedPhone) || normalizedPhone.includes(aptPhone);
          });
          if (byPhone.length > 0) {
            filteredAppointments = byPhone;
          }
        }

        console.log(`[Scheduling] Found ${filteredAppointments.length} appointments for client`);

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

        const { data: existingApt, error: aptError } = await supabase
          .from("appointments")
          .select("*, service:services(id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes)")
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

        const { data: conflicts } = await supabase
          .from("appointments")
          .select("id")
          .eq("law_firm_id", lawFirmId)
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

        const { error: updateError } = await supabase
          .from("appointments")
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

        if (existingApt.client_phone) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-appointment-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                appointment_id,
                type: "updated"
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
          message: `Seu agendamento foi reagendado com sucesso! 📅\n\n📅 *Nova data:* ${formattedDate}\n⏰ *Novo horário:* ${formattedStartTime} às ${formattedEndTime}\n📋 *Serviço:* ${service.name}${companyName ? `\n📍 *Local:* ${companyName}` : ""}\n\nAguardamos você! 😊`,
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
          .from("appointments")
          .select("*, service:services(name)")
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
          .from("appointments")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: reason || "Cancelado pelo cliente via chat"
          })
          .eq("id", appointment_id);

        if (updateError) {
          console.error("[Scheduling] Error cancelling:", updateError);
          return JSON.stringify({ success: false, error: "Erro ao cancelar" });
        }

        if (existingApt.client_phone) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-appointment-notification`, {
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
          .from("appointments")
          .select("*, service:services(name)")
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
          .from("appointments")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString()
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
          message: `Agendamento confirmado com sucesso! ✅\n\nEsperamos você no dia ${formattedDate} às ${formattedTime}.\n\nServiço: ${existingApt.service?.name}`,
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

// Execute template tool call
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
    
    // Return template content for AI to use
    let response: any = {
      success: true,
      template_name: matchedTemplate.name,
      content: matchedTemplate.content,
      message: `Encontrei o template "${matchedTemplate.name}". Envie o conteúdo ao cliente:`
    };
    
    // Include media if available
    if (matchedTemplate.media_url) {
      response.media_url = matchedTemplate.media_url;
      response.media_type = matchedTemplate.media_type;
      response.message += ` (inclui ${matchedTemplate.media_type || 'mídia'})`;
    }
    
    // Include additional message if provided
    if (args.additional_message) {
      response.additional_message = args.additional_message;
    }
    
    return JSON.stringify(response);
    
  } catch (error) {
    console.error(`[AI Chat] Template tool error:`, error);
    return JSON.stringify({ error: "Erro ao buscar template" });
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
          item_type
        )
      `)
      .eq("automation_id", automationId);
    
    if (error || !linkedKnowledge || linkedKnowledge.length === 0) {
      return "";
    }
    
    // Build knowledge context
    const knowledgeTexts = linkedKnowledge
      .filter((item: any) => item.knowledge_items?.content)
      .map((item: any) => {
        const ki = item.knowledge_items;
        return `### ${ki.title}\n${ki.content}`;
      });
    
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
    
    // Generate summary every 20 messages
    if (currentCount && currentCount > lastCount + 20) {
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

      const summaryPrompt = `Resuma esta conversa jurídica em 3-4 frases, destacando:
- O problema principal do cliente
- Informações importantes coletadas
- Status atual do atendimento
- Próximos passos acordados (se houver)

CONVERSA:
${conversationText}

Responda apenas com o resumo, sem formatação especial.`;

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
    if (!conversationId || !message) {
      console.error(`[${errorRef}] Missing required fields`);
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
    if (isWidgetConversation && validatedLawFirmId && widgetSessionId) {
      // Extract client info from context
      const clientName = context?.clientName || "Visitante Web";
      const clientPhone = context?.clientPhone || null;
      const clientEmail = (context as any)?.clientEmail || null;
      
      // Look for existing conversation with this widget session ID
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, client_id")
        .eq("law_firm_id", validatedLawFirmId)
        .eq("origin", "WIDGET")
        .eq("remote_jid", widgetSessionId)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
        console.log(`[AI Chat] Found existing widget conversation: ${conversationId}`);
        
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
                email: clientEmail || undefined
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
                email: clientEmail || undefined
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
        const handlerType = traySettings?.default_handler_type || 'human';
        const assignedTo = handlerType === 'human' ? (traySettings?.default_human_agent_id || null) : null;
        const currentAutomationId = handlerType === 'ai' ? (traySettings?.default_automation_id || null) : null;
        
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
        console.log(`[AI Chat] Created new widget conversation: ${conversationId} for tenant: ${validatedLawFirmId}, handler: ${handlerType}, client: ${clientId}`);
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

    // Check if this agent has scheduling capabilities enabled
    const triggerType = (automation as any).trigger_type;
    const schedulingEnabled = (automation as any).scheduling_enabled === true;
    const isSchedulingAgent = triggerType === "scheduling" || schedulingEnabled;

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

    // Determine which AI to use
    let useOpenAI = false;
    let openaiModel = "gpt-4o-mini";
    
    const { data: globalSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["ai_openai_model"]);
    
    if (globalSettings) {
      const modelSetting = globalSettings.find((s: any) => s.key === "ai_openai_model");
      if (modelSetting?.value && typeof modelSetting.value === "string") {
        openaiModel = modelSetting.value;
      }
    }
    
    if (context?.lawFirmId) {
      const { data: settings } = await supabase
        .from("law_firm_settings")
        .select("ai_provider, ai_capabilities")
        .eq("law_firm_id", context.lawFirmId)
        .maybeSingle();
      
      if (settings?.ai_capabilities) {
        const caps = settings.ai_capabilities as any;
        const iaOpenAI = caps.openai_active ?? (settings.ai_provider === "openai");
        
        if (iaOpenAI && OPENAI_API_KEY) {
          useOpenAI = true;
          console.log(`[AI Chat] Using OpenAI (model=${openaiModel})`);
        }
      }
    }

    // Build messages array
    const fullSystemPrompt = systemPrompt + knowledgeText;
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

    // Add previous messages from context
    if (context?.previousMessages) {
      messages.push(...context.previousMessages);
    }

    // Add current message (wrapped for injection protection)
    messages.push({ role: "user", content: wrapUserInput(message) });

    // Check for calendar integration
    let calendarPermissions = null;
    if (agentLawFirmId) {
      const calendarCheck = await checkCalendarIntegration(supabase, agentLawFirmId);
      if (calendarCheck.active) {
        calendarPermissions = calendarCheck.permissions;
      }
    }

    // Get available tools
    const tools = getAllAvailableTools(
      calendarPermissions,
      true, // CRM tools
      isSchedulingAgent, // Scheduling tools only for scheduling agents
      true // Template tools
    );

    // Call AI
    let aiResponse: string;
    let usedTokens = 0;

    const apiUrl = useOpenAI 
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    
    const apiKey = useOpenAI ? OPENAI_API_KEY : LOVABLE_API_KEY;
    const model = useOpenAI ? openaiModel : "google/gemini-2.5-flash";

    const requestBody: any = {
      model,
      messages,
      temperature,
    };

    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Chat] AI API error:`, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error", ref: errorRef }),
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
        if (["check_availability", "create_event", "list_events", "update_event", "delete_event"].includes(toolName)) {
          toolResult = await executeCalendarTool(
            supabase, supabaseUrl, supabaseKey, agentLawFirmId, conversationId,
            context?.clientId, automationId, { name: toolName, arguments: toolCall.function.arguments }
          );
        } else if (["transfer_to_department", "change_status", "add_tag", "remove_tag", "transfer_to_responsible"].includes(toolName)) {
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

      // Call AI again with tool results
      const followUpResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
        }),
      });

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

    // Save messages to database if we have a valid conversation
    if (isValidUUID(conversationId)) {
      // Save user message
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: message,
        sender_type: "client",
        is_from_me: false,
        message_type: "text",
        status: "delivered"
      });

      // Save AI response
      const { data: savedMessage } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: aiResponse,
        sender_type: "ai",
        is_from_me: true,
        message_type: "text",
        status: "delivered"
      }).select("id").single();

      // Update conversation last_message_at
      await supabase
        .from("conversations")
        .update({ 
          last_message_at: new Date().toISOString(),
          n8n_last_response_at: new Date().toISOString()
        })
        .eq("id", conversationId);

      // Track AI usage
      if (agentLawFirmId) {
        try {
          await supabase.rpc("increment_ai_usage", {
            p_law_firm_id: agentLawFirmId,
            p_tokens: usedTokens,
            p_conversations: 1
          });
        } catch (e) {
          console.error("[AI Chat] Failed to track usage:", e);
        }
      }

      return new Response(
        JSON.stringify({
          response: aiResponse,
          conversationId,
          messageId: savedMessage?.id,
          tokensUsed: usedTokens
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For widget conversations that don't have a UUID yet
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