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
const VALID_SOURCES = ['web', 'whatsapp', 'TRAY', 'api'];

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
              reason: args.reason || `Transferência para atendente ${targetMember.full_name}`
            });
          
          // Return success with notification preference
          if (notifyOnTransfer) {
            return JSON.stringify({ 
              success: true, 
              message: `Conversa transferida para ${targetMember.full_name}. Por favor, informe ao cliente que ele será atendido por um de nossos especialistas.`,
              notify_client: true
            });
          } else {
            return JSON.stringify({ 
              success: true, 
              message: `[AÇÃO INTERNA - NÃO INFORME AO CLIENTE] Conversa transferida para ${targetMember.full_name}. Continue o atendimento normalmente sem mencionar a transferência.`,
              notify_client: false
            });
          }
          
        } else if (args.responsible_type === "ai") {
          // Find AI agent by name
          const { data: agents } = await supabase
            .from("automations")
            .select("id, name")
            .eq("law_firm_id", lawFirmId)
            .eq("is_active", true)
            .neq("id", automationId); // Exclude current agent
          
          const targetAgent = agents?.find((a: any) => 
            a.name.toLowerCase().includes(args.responsible_name.toLowerCase()) ||
            args.responsible_name.toLowerCase().includes(a.name.toLowerCase())
          );
          
          if (!targetAgent) {
            const availableAgents = agents?.map((a: any) => a.name).join(", ") || "nenhum";
            return JSON.stringify({ 
              success: false, 
              error: `Agente de IA "${args.responsible_name}" não encontrado. Disponíveis: ${availableAgents}` 
            });
          }
          
          // Update conversation to use new AI agent
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
          
          // Return success with notification preference
          if (notifyOnTransfer) {
            return JSON.stringify({ 
              success: true, 
              message: `Conversa transferida para o agente de IA ${targetAgent.name}. O novo agente continuará o atendimento.`,
              notify_client: true
            });
          } else {
            return JSON.stringify({ 
              success: true, 
              message: `[AÇÃO INTERNA - NÃO INFORME AO CLIENTE] Conversa transferida para o agente ${targetAgent.name}. Continue normalmente sem mencionar a transferência.`,
              notify_client: false
            });
          }
        }
        
        return JSON.stringify({ 
          success: false, 
          error: "Tipo de responsável inválido. Use 'human' ou 'ai'" 
        });
      }
      
      default:
        return JSON.stringify({ error: `Ação desconhecida: ${toolCall.name}` });
    }
  } catch (error) {
    console.error(`[AI Chat] CRM tool error:`, error);
    return JSON.stringify({ error: "Erro ao executar ação interna" });
  }
}

// Execute template sending tool call
async function executeTemplateTool(
  supabase: any,
  lawFirmId: string,
  toolCall: { name: string; arguments: string }
): Promise<string> {
  try {
    const args = JSON.parse(toolCall.arguments);
    
    console.log(`[AI Chat] Executing template tool: send_template`, args);
    
    const { template_name, additional_message } = args;
    
    if (!template_name) {
      return JSON.stringify({ 
        success: false, 
        error: "Nome do template é obrigatório" 
      });
    }
    
    // Fetch all active templates for this law firm
    const { data: templates, error } = await supabase
      .from("templates")
      .select("id, name, shortcut, content")
      .eq("law_firm_id", lawFirmId)
      .eq("is_active", true);
    
    if (error || !templates || templates.length === 0) {
      return JSON.stringify({ 
        success: false, 
        error: "Nenhum template encontrado",
        available_templates: []
      });
    }
    
    // Find the best matching template (case-insensitive, flexible matching)
    const searchTerm = template_name.toLowerCase().trim();
    const matchedTemplate = templates.find((t: any) => {
      const name = t.name.toLowerCase();
      const shortcut = (t.shortcut || "").toLowerCase();
      
      return (
        name === searchTerm ||
        shortcut === searchTerm ||
        name.includes(searchTerm) ||
        searchTerm.includes(name) ||
        shortcut.includes(searchTerm)
      );
    });
    
    if (!matchedTemplate) {
      const availableNames = templates.map((t: any) => t.name).join(", ");
      return JSON.stringify({ 
        success: false, 
        error: `Template "${template_name}" não encontrado. Disponíveis: ${availableNames}`,
        available_templates: templates.map((t: any) => ({ name: t.name, shortcut: t.shortcut }))
      });
    }
    
    console.log(`[AI Chat] ✅ Found template: "${matchedTemplate.name}" for search "${template_name}"`);
    
    // Build the response content
    let responseContent = "";
    
    if (additional_message) {
      responseContent = additional_message + "\n\n";
    }
    
    responseContent += matchedTemplate.content || "";
    
    return JSON.stringify({
      success: true,
      template_name: matchedTemplate.name,
      template_content: responseContent,
      message: `Template "${matchedTemplate.name}" será enviado ao cliente`,
      send_to_client: true
    });
    
  } catch (error) {
    console.error(`[AI Chat] Template tool error:`, error);
    return JSON.stringify({ error: "Erro ao buscar template" });
  }
}

// Execute scheduling tool call (for intelligent appointment system)
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
    console.log(`[AI Chat] Executing scheduling tool: ${toolCall.name}`, args);

    switch (toolCall.name) {
      case "list_services": {
        const { data: services, error } = await supabase
          .from("services")
          .select("id, name, description, duration_minutes, price, is_active")
          .eq("law_firm_id", lawFirmId)
          .eq("is_active", true)
          .order("name");

        if (error) {
          return JSON.stringify({ success: false, error: "Erro ao buscar serviços" });
        }

        if (!services || services.length === 0) {
          return JSON.stringify({
            success: true,
            message: "Nenhum serviço cadastrado ainda.",
            services: []
          });
        }

        const serviceList = services.map((s: any) => ({
          id: s.id,
          nome: s.name,
          descricao: s.description,
          duracao_minutos: s.duration_minutes,
          preco: s.price ? `R$ ${s.price.toFixed(2)}` : "Gratuito"
        }));

        return JSON.stringify({
          success: true,
          message: `${services.length} serviço(s) disponível(is)`,
          services: serviceList
        });
      }

      case "get_available_slots": {
        const { date, service_id } = args;
        
        if (!date || !service_id) {
          return JSON.stringify({ success: false, error: "Data e serviço são obrigatórios" });
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

        // Get law firm business hours and timezone
        const { data: lawFirm, error: lawFirmError } = await supabase
          .from("law_firms")
          .select("business_hours, timezone")
          .eq("id", lawFirmId)
          .single();

        if (lawFirmError || !lawFirm?.business_hours) {
          return JSON.stringify({ success: false, error: "Horário de funcionamento não configurado" });
        }

        const timezone = lawFirm.timezone || "America/Sao_Paulo";
        const businessHours = lawFirm.business_hours as Record<string, { enabled: boolean; start: string; end: string }>;
        
        // Parse the date correctly considering timezone
        const targetDate = new Date(date + "T12:00:00"); // use noon to avoid date shift issues
        const dayOfWeek = targetDate.getDay();
        const dayMap: Record<number, string> = {
          0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
          4: "thursday", 5: "friday", 6: "saturday"
        };
        const dayKey = dayMap[dayOfWeek];
        const dayHours = businessHours[dayKey];

        if (!dayHours?.enabled) {
          return JSON.stringify({
            success: true,
            message: `Não há atendimento neste dia da semana.`,
            available_slots: []
          });
        }

        // Get existing appointments for this date
        // IMPORTANT: Appointments are stored in UTC, so we need to search using UTC range
        // Brazil is UTC-3, so 00:00 local = 03:00 UTC and 23:59 local = 02:59 UTC next day
        const startOfDayUTC = date + "T03:00:00Z"; // 00:00 Brazil = 03:00 UTC
        const endOfDayUTC = new Date(new Date(date + "T00:00:00Z").getTime() + 27 * 60 * 60 * 1000).toISOString(); // next day 03:00 UTC

        console.log(`[get_available_slots] Searching appointments for date ${date}`);
        console.log(`[get_available_slots] UTC range: ${startOfDayUTC} to ${endOfDayUTC}`);
        console.log(`[get_available_slots] Business hours: ${dayHours.start} to ${dayHours.end}`);

        const { data: existingAppointments, error: apptError } = await supabase
          .from("appointments")
          .select("start_time, end_time, status")
          .eq("law_firm_id", lawFirmId)
          .neq("status", "cancelled")
          .gte("start_time", startOfDayUTC)
          .lt("start_time", endOfDayUTC);

        console.log(`[get_available_slots] Found ${existingAppointments?.length || 0} existing appointments:`, 
          existingAppointments?.map((a: { start_time: string; end_time: string; status: string }) => ({
            start: a.start_time,
            end: a.end_time,
            status: a.status
          }))
        );

        // Parse business hours properly (these are local times like "08:00")
        const [startHour, startMin] = dayHours.start.split(":").map(Number);
        const [endHour, endMin] = dayHours.end.split(":").map(Number);

        const totalDuration = service.duration_minutes + 
          (service.buffer_before_minutes || 0) + 
          (service.buffer_after_minutes || 0);

        // Generate slots using simple hour/minute arithmetic (local time logic)
        const slots: string[] = [];
        let currentHour = startHour;
        let currentMin = startMin;
        
        // Get current time in Brazil timezone for comparison
        const nowBrazil = new Date().toLocaleString("en-US", { timeZone: timezone });
        const nowDate = new Date(nowBrazil);
        const todayStr = nowDate.toISOString().split("T")[0];
        const isToday = date === todayStr;
        const currentTimeMinutes = isToday ? nowDate.getHours() * 60 + nowDate.getMinutes() : 0;

        while (true) {
          const slotStartMinutes = currentHour * 60 + currentMin;
          const slotEndMinutes = slotStartMinutes + totalDuration;
          const businessEndMinutes = endHour * 60 + endMin;
          
          // Stop if slot would end after business hours
          if (slotEndMinutes > businessEndMinutes) break;
          
          // Skip past slots if today
          if (!isToday || slotStartMinutes > currentTimeMinutes) {
            // Format times properly
            const slotStartStr = `${String(currentHour).padStart(2, "0")}:${String(currentMin).padStart(2, "0")}`;
            
            // Create slot times in LOCAL timezone, then compare with UTC appointments
            // Convert slot local time to UTC for comparison
            const slotStartUTC = new Date(`${date}T${slotStartStr}:00.000-03:00`); // Brazil time = UTC-3
            const slotEndUTC = new Date(slotStartUTC.getTime() + totalDuration * 60000);
            
            const hasConflict = (existingAppointments || []).some((apt: any) => {
              const aptStart = new Date(apt.start_time);
              const aptEnd = new Date(apt.end_time);
              // Check overlap: slot overlaps appointment if slot starts before apt ends AND slot ends after apt starts
              const overlaps = slotStartUTC < aptEnd && slotEndUTC > aptStart;
              if (overlaps) {
                console.log(`[get_available_slots] Conflict at ${slotStartStr}: slot ${slotStartUTC.toISOString()} - ${slotEndUTC.toISOString()} overlaps with apt ${aptStart.toISOString()} - ${aptEnd.toISOString()}`);
              }
              return overlaps;
            });

            if (!hasConflict) {
              slots.push(slotStartStr);
            }
          }

          // Move to next slot (increment by service duration)
          currentMin += service.duration_minutes;
          while (currentMin >= 60) {
            currentMin -= 60;
            currentHour += 1;
          }
        }
        
        console.log(`[get_available_slots] Generated ${slots.length} available slots: ${slots.join(", ")}`);
        

        if (slots.length === 0) {
          return JSON.stringify({
            success: true,
            message: `Não há horários disponíveis para ${service.name} no dia ${date}. Sugira outra data.`,
            available_slots: [],
            business_hours: `${dayHours.start} às ${dayHours.end}`
          });
        }

        // Group slots for better presentation (morning, afternoon, evening)
        const morning = slots.filter(s => parseInt(s.split(":")[0]) < 12);
        const afternoon = slots.filter(s => {
          const h = parseInt(s.split(":")[0]);
          return h >= 12 && h < 18;
        });
        const evening = slots.filter(s => parseInt(s.split(":")[0]) >= 18);

        // Create summary for AI to present nicely
        let summary = `Horários disponíveis para ${service.name} em ${date} (expediente: ${dayHours.start} às ${dayHours.end}):\n`;
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
          service_name: service.name,
          duration_minutes: service.duration_minutes,
          business_hours: `${dayHours.start} às ${dayHours.end}`,
          available_slots_summary: {
            morning: morning.length > 0 ? `${morning[0]} - ${morning[morning.length - 1]}` : null,
            afternoon: afternoon.length > 0 ? `${afternoon[0]} - ${afternoon[afternoon.length - 1]}` : null,
            evening: evening.length > 0 ? `${evening[0]} - ${evening[evening.length - 1]}` : null,
            total: slots.length
          },
          available_slots: slots.length <= 8 ? slots : undefined,
          hint: slots.length > 8 
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
        // We need to convert to UTC for storage
        const startTime = new Date(`${date}T${time}:00.000-03:00`); // Brazil time = UTC-3
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
        
        // First, try to find existing client with this phone
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id")
          .eq("law_firm_id", lawFirmId)
          .or(`phone.ilike.%${normalizedPhone}%,phone.ilike.%${normalizedPhone.slice(-9)}%`)
          .maybeSingle();

        if (existingClient) {
          // Update existing client to be an agenda client
          agendaClientId = existingClient.id;
          await supabase
            .from("clients")
            .update({
              is_agenda_client: true,
              name: client_name, // Update name if provided
              email: client_email || undefined,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingClient.id);
          console.log(`[book_appointment] Updated existing client ${existingClient.id} as agenda client`);
        } else {
          // Create new client as agenda client
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
        
        // Build a more flexible query to find appointments
        let query = supabase
          .from("appointments")
          .select("id, start_time, end_time, status, client_name, client_phone, client_id, conversation_id, service:services(name, duration_minutes)")
          .eq("law_firm_id", lawFirmId)
          .order("start_time", { ascending: true });

        // Filter by status
        if (status === "scheduled") {
          query = query.eq("status", "scheduled");
        } else if (status === "confirmed") {
          query = query.eq("status", "confirmed");
        } else {
          query = query.in("status", ["scheduled", "confirmed"]);
        }

        // Only future appointments
        query = query.gte("start_time", new Date().toISOString());

        const { data: allAppointments, error } = await query;

        if (error) {
          console.error("[Scheduling] Error listing appointments:", error);
          return JSON.stringify({ success: false, error: "Erro ao buscar agendamentos" });
        }

        // Filter appointments by client - use multiple methods
        let filteredAppointments = allAppointments || [];
        
        // If we have a clientId, filter by it
        if (clientId) {
          const byClientId = filteredAppointments.filter((apt: any) => apt.client_id === clientId);
          if (byClientId.length > 0) {
            filteredAppointments = byClientId;
          }
        }
        
        // If no results and we have a conversation_id, try to find by it
        if (filteredAppointments.length === 0 || !clientId) {
          const byConversation = (allAppointments || []).filter((apt: any) => apt.conversation_id === conversationId);
          if (byConversation.length > 0) {
            filteredAppointments = byConversation;
          }
        }
        
        // If the AI provided a phone number, try to find by phone
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

        // Get existing appointment
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
        // IMPORTANT: time is in Brazil local time (UTC-3), convert to UTC for storage
        const newStartTime = new Date(`${new_date}T${new_time}:00.000-03:00`);
        const totalDuration = service.duration_minutes + 
          (service.buffer_before_minutes || 0) + 
          (service.buffer_after_minutes || 0);
        const newEndTime = new Date(newStartTime.getTime() + totalDuration * 60000);
        
        console.log(`[reschedule_appointment] Rescheduling to ${new_time} Brazil time = ${newStartTime.toISOString()} UTC`);

        // Check for conflicts (excluding the current appointment)
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

        // Update appointment - reset message timestamps so they're re-sent at new times
        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            start_time: newStartTime.toISOString(),
            end_time: newEndTime.toISOString(),
            status: "scheduled",
            confirmed_at: null,
            // Reset all scheduled message timestamps
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

        // Send notification
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

        // Get company name for the message
        const { data: lawFirmData } = await supabase
          .from("law_firms")
          .select("name")
          .eq("id", lawFirmId)
          .single();
        const companyName = lawFirmData?.name || "";

        // Format date and time nicely
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
        const formattedEndTimeStr = rescheduleEndTime.toLocaleTimeString("pt-BR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Sao_Paulo"
        });

        return JSON.stringify({
          success: true,
          message: `Olá ${existingApt.client_name}!\n\nSeu agendamento foi reagendado! 🗓️\n\n📅 *Nova data:* ${formattedDate}\n⏰ *Novo horário:* ${formattedStartTime} às ${formattedEndTimeStr}\n📋 *Serviço:* ${service.name}${companyName ? `\n📍 *Local:* ${companyName}` : ""}\n\nCaso tenha dúvidas, entre em contato.\n\nAguardamos você! 😊`
        });
      }

      case "cancel_appointment": {
        const { appointment_id, reason } = args;

        if (!appointment_id) {
          return JSON.stringify({ success: false, error: "ID do agendamento é obrigatório" });
        }

        // Get appointment
        const { data: existingApt } = await supabase
          .from("appointments")
          .select("id, client_phone, status")
          .eq("id", appointment_id)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (!existingApt) {
          return JSON.stringify({ success: false, error: "Agendamento não encontrado" });
        }

        if (existingApt.status === "cancelled") {
          return JSON.stringify({ success: false, error: "Este agendamento já está cancelado" });
        }

        // Cancel appointment and clear scheduled messages
        const { error: cancelError } = await supabase
          .from("appointments")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: reason || "Cancelado pelo cliente via chat",
            // Clear scheduled messages - they won't be sent for cancelled appointments
            reminder_sent_at: null,
            confirmation_sent_at: null,
            pre_message_sent_at: null
          })
          .eq("id", appointment_id);

        if (cancelError) {
          console.error("[Scheduling] Error cancelling:", cancelError);
          return JSON.stringify({ success: false, error: "Erro ao cancelar agendamento" });
        }

        // Send notification
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
            console.error("[Scheduling] Failed to send cancel notification:", e);
          }
        }

        return JSON.stringify({
          success: true,
          message: "Agendamento cancelado com sucesso. O horário foi liberado."
        });
      }

      case "confirm_appointment": {
        const { appointment_id } = args;

        if (!appointment_id) {
          return JSON.stringify({ success: false, error: "ID do agendamento é obrigatório" });
        }

        // Get appointment
        const { data: existingApt } = await supabase
          .from("appointments")
          .select("id, status, start_time, service:services(name)")
          .eq("id", appointment_id)
          .eq("law_firm_id", lawFirmId)
          .single();

        if (!existingApt) {
          return JSON.stringify({ success: false, error: "Agendamento não encontrado" });
        }

        if (existingApt.status === "cancelled") {
          return JSON.stringify({ success: false, error: "Este agendamento foi cancelado" });
        }

        if (existingApt.status === "confirmed") {
          return JSON.stringify({
            success: true,
            message: "Este agendamento já está confirmado!"
          });
        }

        // Confirm appointment
        const { error: confirmError } = await supabase
          .from("appointments")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString()
          })
          .eq("id", appointment_id);

        if (confirmError) {
          console.error("[Scheduling] Error confirming:", confirmError);
          return JSON.stringify({ success: false, error: "Erro ao confirmar agendamento" });
        }

        const aptDate = new Date(existingApt.start_time);
        return JSON.stringify({
          success: true,
          message: `Presença confirmada! Aguardamos você no dia ${aptDate.toLocaleDateString("pt-BR")} às ${aptDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
        });
      }

      default:
        return JSON.stringify({ error: `Ferramenta desconhecida: ${toolCall.name}` });
    }
  } catch (error) {
    console.error(`[AI Chat] Scheduling tool error:`, error);
    return JSON.stringify({ error: "Erro ao executar ação de agendamento" });
  }
}

// Get all available tools (calendar + CRM)
function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Record AI conversation usage for billing purposes.
 * Deduplicates by conversation_id per billing period (monthly).
 */
async function recordAIConversationUsage(
  supabase: any,
  lawFirmId: string,
  conversationId: string,
  automationId: string,
  automationName: string,
  source: string
): Promise<boolean> {
  const billingPeriod = getCurrentBillingPeriod();
  
  try {
    // Check if this conversation was already counted this billing period
    const { data: existingRecord } = await supabase
      .from('usage_records')
      .select('id')
      .eq('law_firm_id', lawFirmId)
      .eq('usage_type', 'ai_conversation')
      .eq('billing_period', billingPeriod)
      .eq('metadata->>conversation_id', conversationId)
      .limit(1);
    
    if (existingRecord && existingRecord.length > 0) {
      console.log('[AI Chat] Conversation already counted this period', { 
        conversationId, 
        billingPeriod 
      });
      return false; // Already counted
    }
    
    // Record the usage - this conversation is being handled by AI for the first time this month
    const { error } = await supabase
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
      console.error('[AI Chat] Failed to record AI usage', { error, lawFirmId });
      return false;
    }
    
    console.log('[AI Chat] AI conversation usage recorded', { 
      lawFirmId,
      conversationId,
      source,
      billingPeriod 
    });
    return true;
  } catch (err) {
    console.error('[AI Chat] Error recording AI usage', { error: err instanceof Error ? err.message : err });
    return false;
  }
}

// Helper to fetch agent knowledge base items
async function getAgentKnowledge(
  supabase: any,
  automationId: string
): Promise<string> {
  const { data: agentKnowledge, error } = await supabase
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

  if (error || !agentKnowledge || agentKnowledge.length === 0) {
    console.log(`[AI Chat] No knowledge items found for automation ${automationId}`);
    return "";
  }

  const knowledgeItems = agentKnowledge
    .map((ak: any) => ak.knowledge_items)
    .filter(Boolean);

  if (knowledgeItems.length === 0) {
    return "";
  }

  const knowledgeText = knowledgeItems
    .map((item: any) => `### ${item.title} (${item.category})\n${item.content || ""}`)
    .join("\n\n");

  console.log(`[AI Chat] Loaded ${knowledgeItems.length} knowledge items for automation ${automationId}`);

  return `\n\n📚 BASE DE CONHECIMENTO (use estas informações para responder):\n${knowledgeText}`;
}

// Helper to fetch client memories
async function getClientMemories(
  supabase: any,
  clientId: string
): Promise<string> {
  const { data: memories } = await supabase
    .from("client_memories")
    .select("fact_type, content, importance")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("importance", { ascending: false })
    .limit(15);

  if (!memories || memories.length === 0) {
    return "";
  }

  const memoryText = (memories as any[])
    .map((m: any) => `- [${m.fact_type}] ${m.content}`)
    .join("\n");

  return `\n\n📝 MEMÓRIA DO CLIENTE (fatos importantes já conhecidos):\n${memoryText}`;
}

// Helper to get conversation context for long conversations
async function getConversationContext(
  supabase: any,
  conversationId: string,
  maxMessages: number = 25 // Increased from 10 to maintain better context
): Promise<{ messages: Array<{ role: string; content: string }>; needsSummary: boolean }> {
  // Get total message count
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const totalMessages = count || 0;
  // Generate summary earlier (after 15 messages instead of 20)
  const needsSummary = totalMessages > 15;

  // Get recent messages
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("content, is_from_me, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(maxMessages);

  if (!recentMessages || recentMessages.length === 0) {
    return { messages: [], needsSummary: false };
  }

  // Convert to chat format (reverse to chronological order)
  const messages = (recentMessages as any[])
    .reverse()
    .filter((m: any) => m.content)
    .map((m: any) => ({
      role: m.is_from_me ? "assistant" : "user",
      content: m.content!
    }));

  return { messages, needsSummary };
}

// Generate and save conversation summary
async function generateAndSaveSummary(
  supabase: any,
  conversationId: string,
  LOVABLE_API_KEY: string
): Promise<string | null> {
  // Check if we recently summarized
  const { data: conversation } = await supabase
    .from("conversations")
    .select("ai_summary, last_summarized_at, summary_message_count")
    .eq("id", conversationId)
    .single();

  const { count: currentCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const conv = conversation as any;

  // If we have a recent summary and not many new messages, use existing
  // Reduced threshold from 15 to 8 new messages to update summary more frequently
  if (
    conv?.ai_summary &&
    conv?.summary_message_count &&
    currentCount &&
    currentCount - conv.summary_message_count < 8
  ) {
    return conv.ai_summary;
  }

  // Get all messages for summary
  const { data: allMessages } = await supabase
    .from("messages")
    .select("content, is_from_me, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!allMessages || allMessages.length < 10) {
    return null;
  }

  // Build conversation text for summarization
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

  try {
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
      return conv?.ai_summary || null;
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;

    if (summary) {
      // Save summary to conversation
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

    return conv?.ai_summary || null;
  } catch (error) {
    console.error("[AI Chat] Summary generation error:", error);
    return conv?.ai_summary || null;
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

    // Validate required fields
    if (!conversationId || !message) {
      console.error(`[${errorRef}] Missing required fields`);
      return new Response(
        JSON.stringify({ error: "conversationId and message are required", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate conversationId UUID format
    if (!isValidUUID(conversationId)) {
      console.error(`[${errorRef}] Invalid conversationId format`);
      return new Response(
        JSON.stringify({ error: "Invalid request format", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    console.log(`[AI Chat] Request validated - conversationId: ${conversationId}, messageLength: ${message.length}`);

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

    // Get Tray Chat integration settings if source is web/TRAY
    let traySettings: any = null;
    if ((source === 'web' || source === 'TRAY') && context?.lawFirmId) {
      const { data: trayIntegration } = await supabase
        .from("tray_chat_integrations")
        .select("default_automation_id, default_department_id, default_status_id, is_active")
        .eq("law_firm_id", context.lawFirmId)
        .eq("is_active", true)
        .maybeSingle();
      
      if (trayIntegration) {
        traySettings = trayIntegration;
        console.log(`[AI Chat] Loaded Tray settings for law_firm ${context.lawFirmId}:`, {
          default_automation_id: traySettings.default_automation_id,
          default_department_id: traySettings.default_department_id,
          default_status_id: traySettings.default_status_id
        });
        
        // Use Tray's default automation if no automationId was provided
        if (!automationId && traySettings.default_automation_id) {
          automationId = traySettings.default_automation_id;
          console.log(`[AI Chat] Using Tray default automation: ${automationId}`);
        }
      }
    }

    // Determine which AI to use based on law_firm_settings
    let useOpenAI = false;
    let iaSettings: any = null;
    let openaiModel = "gpt-4o-mini"; // Default model
    
    // Fetch global AI settings (model selection from Global Admin)
    const { data: globalSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["ai_openai_model"]);
    
    if (globalSettings) {
      const modelSetting = globalSettings.find(s => s.key === "ai_openai_model");
      if (modelSetting?.value && typeof modelSetting.value === "string") {
        openaiModel = modelSetting.value;
        console.log(`[AI Chat] Global OpenAI model configured: ${openaiModel}`);
      }
    }
    
    if (context?.lawFirmId) {
      const { data: settings } = await supabase
        .from("law_firm_settings")
        .select("ai_provider, ai_capabilities")
        .eq("law_firm_id", context.lawFirmId)
        .maybeSingle();
      
      iaSettings = settings;
      
      if (settings?.ai_capabilities) {
        const caps = settings.ai_capabilities as any;
        const iaInternal = caps.ia_site_active ?? (settings.ai_provider === "internal");
        const iaOpenAI = caps.openai_active ?? (settings.ai_provider === "openai");
        
        // Priority rule: If OpenAI is active (alone or with IA do Site), use OpenAI for chat
        // Exception: If ONLY IA do Site is active, use Lovable AI
        if (iaOpenAI && OPENAI_API_KEY) {
          useOpenAI = true;
          console.log(`[AI Chat] Using OpenAI (openai_active=${iaOpenAI}, ia_site_active=${iaInternal}, model=${openaiModel})`);
        } else {
          console.log(`[AI Chat] Using Lovable AI (internal) - openai_active=${iaOpenAI}, ia_site_active=${iaInternal}`);
        }
      }
    }

    // CRITICAL: Agent prompt is the SINGLE SOURCE OF TRUTH
    // No default/fallback prompts - must have automationId with valid prompt
    let systemPrompt: string | null = null;
    let temperature = 0.7;
    let automationName = "";
    let knowledgeText = "";
    let agentLawFirmId: string | null = null;

    // automationId is REQUIRED for proper agent behavior
    if (!automationId) {
      console.error(`[${errorRef}] automationId is required for proper AI behavior`);
      return new Response(
        JSON.stringify({ error: "AI agent configuration required", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent configuration - the ONLY source of behavior
    // CRITICAL: Always fetch fresh from database - NO CACHING
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

    // ========================================================================
    // CRITICAL SECURITY CHECK: Validate tenant isolation
    // If context includes lawFirmId, the automation MUST belong to that tenant
    // ========================================================================
    const contextLawFirmId = context?.lawFirmId;
    if (contextLawFirmId && automation.law_firm_id !== contextLawFirmId) {
      console.error(`[${errorRef}] SECURITY VIOLATION - Cross-tenant automation execution blocked`);
      return new Response(
        JSON.stringify({ error: "Access denied", ref: errorRef }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use ONLY the agent's configured prompt
    systemPrompt = (automation as any).ai_prompt;
    if ((automation as any).ai_temperature !== null) {
      temperature = (automation as any).ai_temperature;
    }
    automationName = (automation as any).name;
    
    // Get law_firm_id from automation (for usage tracking)
    agentLawFirmId = (automation as any).law_firm_id;

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
        // Process mentions - replace @mention placeholders with actual values
        const mentionReplacements: Record<string, string> = {
          "@Nome da empresa": lawFirmData.name || "",
          "@Endereço": lawFirmData.address || "",
          "@Telefone": lawFirmData.phone || "",
          "@Email": lawFirmData.email || "",
          "@Instagram": lawFirmData.instagram || "",
          "@Facebook": lawFirmData.facebook || "",
          "@Website": lawFirmData.website || "",
        };
        
        // Process @Horário comercial - format business hours if available
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
        
        // Log the prompt before replacement to debug
        console.log(`[AI Chat] Processing prompt for mentions. Prompt length: ${systemPrompt.length}`);
        console.log(`[AI Chat] Sample of prompt (first 200 chars): ${systemPrompt.substring(0, 200)}`);
        
        // Apply all replacements
        for (const [mention, value] of Object.entries(mentionReplacements)) {
          if (systemPrompt.includes(mention)) {
            systemPrompt = systemPrompt.replace(new RegExp(mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
            console.log(`[AI Chat] ✅ Replaced mention "${mention}" with: "${value.substring(0, 50)}..."`);
          }
        }
        
        // Also handle the structured format @empresa:Nome, @empresa:Telefone, etc.
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
            console.log(`[AI Chat] Replaced structured mention ${mention}`);
          }
        }
      }
      
      // Process client context mentions if available
      if (context?.clientName) {
        systemPrompt = systemPrompt.replace(/@Nome do cliente/g, context.clientName);
        systemPrompt = systemPrompt.replace(/@cliente:Nome/g, context.clientName);
      }
      
      // ========================================================================
      // PROCESS TEMPLATE MENTIONS: Replace @template:Name with actual content
      // ========================================================================
      const templateMentionPattern = /@template:([^\s@]+(?:\s+[^\s@]+)*?)(?=\s*[@\n]|$)/g;
      const templateMatches = systemPrompt.matchAll(templateMentionPattern);
      
      for (const match of templateMatches) {
        const fullMatch = match[0]; // @template:Nome do Template
        const templateNameRaw = match[1].trim(); // Nome do Template
        
        // Try to find template by name or shortcut (case insensitive)
        const { data: templateData } = await supabase
          .from("templates")
          .select("name, shortcut, content")
          .eq("law_firm_id", agentLawFirmId)
          .eq("is_active", true);
        
        if (templateData && templateData.length > 0) {
          // Find best match by name or shortcut
          const matchedTemplate = templateData.find(
            (t: any) => 
              t.name.toLowerCase() === templateNameRaw.toLowerCase() ||
              t.shortcut.toLowerCase() === templateNameRaw.toLowerCase() ||
              t.name.toLowerCase().startsWith(templateNameRaw.toLowerCase())
          );
          
          if (matchedTemplate) {
            systemPrompt = systemPrompt.replace(fullMatch, matchedTemplate.content || "");
            console.log(`[AI Chat] ✅ Replaced template mention "${fullMatch}" with content from "${matchedTemplate.name}"`);
          } else {
            console.log(`[AI Chat] ⚠️ Template not found: "${templateNameRaw}"`);
          }
        }
      }
    }

    // ========================================================================
    // AUDIT LOG: Canonical identity for every AI execution
    // ========================================================================
    console.log(`[AI_ISOLATION] ✅ EXECUTION START - Canonical Identity Validated`, JSON.stringify({
      tenant_id: agentLawFirmId,
      ai_id: automation.id,
      ai_name: automationName,
      ai_role: aiRole,
      prompt_version: automation.version,
      prompt_updated_at: automation.updated_at,
      prompt_length: systemPrompt.length,
      conversation_id: conversationId,
      context_tenant_validated: !!contextLawFirmId,
      timestamp: new Date().toISOString(),
    }));

    // ONLY load knowledge bases that are EXPLICITLY LINKED to this agent
    // This ensures complete tenant and agent isolation
    knowledgeText = await getAgentKnowledge(supabase, automationId);
    if (knowledgeText) {
      console.log(`[AI_ISOLATION] Knowledge base loaded ONLY for agent ${automationId} (tenant: ${agentLawFirmId})`);
    } else {
      console.log(`[AI_ISOLATION] No knowledge base linked to agent ${automationId}`);
    }

    // Build messages array - agent prompt is the ONLY system instruction
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    // Add behavioral instruction for human-like responses (appended, not replacing)
    messages.push({ 
      role: "system", 
      content: `REGRA CRÍTICA DE COMUNICAÇÃO E FORMATAÇÃO:
- Responda como uma pessoa real em atendimento por WhatsApp
- Divida sua resposta em PARÁGRAFOS SEPARADOS (com linha em branco entre eles)
- Cada parágrafo deve conter NO MÁXIMO 2-3 frases
- NÃO envie um único bloco de texto longo
- Faça UMA pergunta ou informação por parágrafo
- Use linguagem natural e profissional
- Aguarde a resposta do cliente antes de continuar

EXEMPLO DE FORMATAÇÃO CORRETA:
"Claro, Sr. João! Para a revisão da aposentadoria, precisamos dos seguintes documentos:

- Extrato de contribuições (CNIS)
- Extrato de informações de benefício
- Carta de concessão do benefício

O senhor já tem acesso ao aplicativo Meu INSS para baixar esses documentos?"

EXEMPLO INCORRETO (não faça assim):
"Claro, Sr. João. Para a revisão da aposentadoria, precisamos dos seguintes documentos: Extrato de contribuições (CNIS), Extrato de informações de benefício e a Carta de concessão do benefício. O senhor já tem acesso ao aplicativo Meu INSS para baixar esses documentos?"

🚨 REGRA ABSOLUTAMENTE CRÍTICA SOBRE PEDIDOS DE ÁUDIO 🚨
ATENÇÃO: Esta regra é OBRIGATÓRIA e sua violação causa falha total no sistema!

QUANDO O CLIENTE PEDIR RESPOSTA POR ÁUDIO/VOZ:
✅ CORRETO: Responda diretamente com a informação solicitada em texto
   Exemplo: "Você vai precisar de RG, CPF e comprovante de residência."

❌ PROIBIDO (causa erro crítico no sistema):
   - "Vou ativar o áudio..."
   - "Vou mandar por áudio..."
   - "Um momento, vou gravar..."
   - "Claro, vou te explicar por áudio..."
   - Qualquer frase anunciando que vai enviar áudio

O SISTEMA CONVERTE AUTOMATICAMENTE SUA RESPOSTA DE TEXTO EM ÁUDIO.
Se você enviar apenas um "aviso", o cliente receberá um áudio dizendo "vou mandar áudio" - o que é inútil e quebra a experiência.

RESPONDA SEMPRE COM O CONTEÚDO REAL, NUNCA COM AVISOS!` 
    });

    // Add knowledge base as context (if linked to this agent)
    if (knowledgeText) {
      messages.push({ role: "system", content: knowledgeText });
    }

    // Check Google Calendar integration and add instructions
    const effectiveLawFirmIdForCalendar = agentLawFirmId || context?.lawFirmId;
    if (effectiveLawFirmIdForCalendar) {
      const calendarIntegration = await checkCalendarIntegration(supabase, effectiveLawFirmIdForCalendar);
      if (calendarIntegration.active && calendarIntegration.permissions.read) {
        // Get current date/time for context
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const brazilTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        
        let calendarInstructions = `\n\n📅 GOOGLE CALENDAR INTEGRADO - VOCÊ TEM ACESSO PARA:`;
        if (calendarIntegration.permissions.read) {
          calendarInstructions += `\n- Verificar horários disponíveis (use a função check_availability)`;
          calendarInstructions += `\n- Listar eventos agendados (use a função list_events)`;
        }
        if (calendarIntegration.permissions.create) {
          calendarInstructions += `\n- Criar novos agendamentos (use a função create_event)`;
        }
        if (calendarIntegration.permissions.edit) {
          calendarInstructions += `\n- Remarcar compromissos (use a função update_event)`;
        }
        if (calendarIntegration.permissions.delete) {
          calendarInstructions += `\n- Cancelar compromissos (use a função delete_event)`;
        }
        calendarInstructions += `\n\n⚠️ DATA E HORA ATUAL: ${brazilTime} (Fuso: America/Sao_Paulo)
📆 DATA ATUAL: ${currentDate} (Ano: ${currentYear}, Mês: ${currentMonth}, Dia: ${currentDay})

REGRAS CRÍTICAS PARA AGENDAMENTO:
1. SEMPRE use o ano ${currentYear} ou posterior para datas futuras
2. Se o cliente disser "segunda-feira" ou "próxima semana", calcule a partir de HOJE (${currentDate})
3. NUNCA use datas no passado - sempre verifique se start_time é MAIOR que ${now.toISOString()}
4. Use as funções do calendário SEMPRE que identificar intenção de agendamento
5. Confirme os dados com o cliente ANTES de criar o evento
6. Após executar a ação, confirme o sucesso ao cliente
7. Se o cliente não especificar horário, verifique disponibilidade primeiro usando check_availability`;
        
        messages.push({ role: "system", content: calendarInstructions });
        console.log(`[AI Chat] Added calendar instructions for law_firm ${effectiveLawFirmIdForCalendar}`);
      }
    }

    // Add CRM/Internal actions instructions (always available)
    if (effectiveLawFirmIdForCalendar) {
      // Fetch available departments, statuses, and agents for context
      const [deptResult, statusResult, agentResult, memberResult] = await Promise.all([
        supabase.from("departments").select("name").eq("law_firm_id", effectiveLawFirmIdForCalendar).eq("is_active", true),
        supabase.from("custom_statuses").select("name").eq("law_firm_id", effectiveLawFirmIdForCalendar).eq("is_active", true),
        supabase.from("automations").select("name").eq("law_firm_id", effectiveLawFirmIdForCalendar).eq("is_active", true).neq("id", automationId),
        supabase.from("profiles").select("full_name").eq("law_firm_id", effectiveLawFirmIdForCalendar).eq("is_active", true)
      ]);
      
      const departments = deptResult.data?.map((d: any) => d.name) || [];
      const statuses = statusResult.data?.map((s: any) => s.name) || [];
      const otherAgents = agentResult.data?.map((a: any) => a.name) || [];
      const teamMembers = memberResult.data?.map((m: any) => m.full_name) || [];
      
      const crmInstructions = `\n\n🔧 AÇÕES INTERNAS DISPONÍVEIS - VOCÊ PODE:

📁 TRANSFERIR PARA DEPARTAMENTO (use transfer_to_department):
- Use quando o cliente precisa de atendimento especializado
- Departamentos disponíveis: ${departments.length > 0 ? departments.join(", ") : "nenhum configurado"}
- Exemplo: transferir para "Suporte" quando há problema técnico

📊 ALTERAR STATUS DO CLIENTE (use change_status):
- Use para marcar evolução no funil de vendas/atendimento
- Status disponíveis: ${statuses.length > 0 ? statuses.join(", ") : "nenhum configurado"}
- Exemplo: marcar como "Qualificado" quando cliente demonstra interesse

🏷️ ADICIONAR/REMOVER ETIQUETAS (use add_tag e remove_tag):
- Use para categorizar o cliente baseado em suas características
- Você pode criar novas tags se necessário
- Exemplo: adicionar "VIP" para clientes prioritários

👥 TRANSFERIR PARA OUTRO RESPONSÁVEL (use transfer_to_responsible):
- Use quando precisa passar o atendimento para outra pessoa ou IA
- Para humanos disponíveis: ${teamMembers.length > 0 ? teamMembers.join(", ") : "nenhum"}
- Para outros agentes de IA: ${otherAgents.length > 0 ? otherAgents.join(", ") : "nenhum"}
- Tipos: "human" para atendente, "ai" para outro agente de IA

REGRAS PARA USO DAS AÇÕES:
1. Use quando identificar claramente a necessidade
2. Confirme a ação com o cliente quando apropriado
3. Informe o cliente sobre o que foi feito após executar
4. Use nomes exatos ou similares dos itens disponíveis`;
      
      messages.push({ role: "system", content: crmInstructions });
      console.log(`[AI Chat] Added CRM instructions with ${departments.length} depts, ${statuses.length} statuses, ${otherAgents.length} agents, ${teamMembers.length} members`);
      
      // Fetch available templates for this law firm
      const { data: templatesData } = await supabase
        .from("templates")
        .select("name, shortcut, content")
        .eq("law_firm_id", effectiveLawFirmIdForCalendar)
        .eq("is_active", true);
      
      if (templatesData && templatesData.length > 0) {
        const templatesList = templatesData.map((t: any) => {
          const hasMedia = t.content?.match(/^\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\]/i);
          const mediaType = hasMedia ? hasMedia[1].toLowerCase() : null;
          const mediaLabel = mediaType === 'image' ? '📷' : mediaType === 'video' ? '🎬' : mediaType === 'audio' ? '🎤' : mediaType === 'document' ? '📄' : '📝';
          return `  - ${mediaLabel} "${t.name}" (atalho: ${t.shortcut || 'N/A'})`;
        }).join("\n");
        
        const templateInstructions = `\n\n📨 TEMPLATES DISPONÍVEIS (use send_template):
Você pode enviar materiais pré-configurados para o cliente usando a função send_template.

TEMPLATES DISPONÍVEIS:
${templatesList}

COMO USAR:
- Quando o cliente pedir um arquivo, guia, imagem ou documento, use send_template
- Informe o nome do template (ex: "Baixar extratos", "Avaliação")
- Você pode adicionar uma mensagem personalizada junto com o template
- O sistema enviará automaticamente o conteúdo do template (texto, imagem, vídeo, etc.)

⚠️ IMPORTANTE:
- NÃO diga apenas "vou enviar" sem usar a função send_template
- SEMPRE use a função send_template para realmente enviar o material
- Use o nome do template exato ou similar para encontrar o correto`;
        
        messages.push({ role: "system", content: templateInstructions });
        console.log(`[AI Chat] Added ${templatesData.length} templates to instructions`);
      }
    }

    // Add SCHEDULING instructions if agent has scheduling enabled
    if (isSchedulingAgent && effectiveLawFirmIdForCalendar) {
      // Fetch services for context
      const { data: services } = await supabase
        .from("services")
        .select("id, name, duration_minutes, price")
        .eq("law_firm_id", effectiveLawFirmIdForCalendar)
        .eq("is_active", true);

      const servicesList = services?.map((s: any) =>
        `  - ${s.name} (id: ${s.id}, ${s.duration_minutes}min${s.price ? `, R$${s.price}` : ""})`
      ).join("\n") || "  Nenhum serviço cadastrado";

      const onlyService = services && services.length === 1 ? services[0] : null;

      // Get current date for context
      const now = new Date();
      const currentDate = now.toISOString().split("T")[0];
      const brazilTime = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

      const schedulingInstructions = `\n\n📅 SISTEMA DE AGENDAMENTO INTELIGENTE - VOCÊ TEM ACESSO PARA:

🎯 FUNÇÕES DISPONÍVEIS:
1. **list_services** - Listar serviços (retorna IDs)
2. **get_available_slots** - Verificar horários livres (exige date + service_id)
3. **book_appointment** - Criar agendamento
4. **list_client_appointments** - Ver agendamentos do cliente (reagendar/cancelar/confirmar)
5. **reschedule_appointment** - Remarcar
6. **cancel_appointment** - Cancelar
7. **confirm_appointment** - Confirmar presença

📋 SERVIÇOS DISPONÍVEIS (com ID e duração):
${servicesList}

⏰ DATA/HORA ATUAL: ${brazilTime} (Fuso: America/Sao_Paulo)
📆 HOJE: ${currentDate}

🎯 COMO APRESENTAR SERVIÇOS AO CLIENTE:
- Quando o cliente perguntar sobre serviços, apresente de forma clara e organizada:
  - Nome do serviço
  - Duração (ex: "40 minutos")
  - Preço se houver
- Exemplo de resposta: "Temos os seguintes serviços:\n\n💆 *Massagem* - 40 minutos - R$ 80,00\n💅 *Manicure* - 30 minutos - R$ 50,00"

✅ COMO RESPONDER QUANDO O CLIENTE PEDIR HORÁRIOS LIVRES/DISPONÍVEIS:
- Se o cliente informar a DATA (ex: "amanhã", "dia 15") e o SERVIÇO (ex: "massagem") → use **get_available_slots** e devolva a lista de horários.
- Se o cliente NÃO informar o serviço:
  - Se existir apenas 1 serviço cadastrado (${onlyService ? `"${onlyService.name}"` : "nenhum/mais de um"}) → você PODE usar esse serviço e chamar **get_available_slots** direto.
  - Se houver mais de 1 serviço → use **list_services** e pergunte qual serviço deseja.
- Se o cliente NÃO informar a data → pergunte a data desejada (e só depois chame get_available_slots).

⏰ SEMPRE MOSTRE O INTERVALO COMPLETO DO HORÁRIO:
- Quando mencionar horários, SEMPRE inclua início e fim baseado na duração do serviço
- Exemplo: Se o serviço dura 40 minutos e o cliente quer 10:00, diga "10:00 às 10:40"
- Exemplo: Se o serviço dura 1h30 e o cliente quer 14:00, diga "14:00 às 15:30"
- Isso ajuda o cliente a saber exatamente quanto tempo ficará

🔄 FLUXO COMPLETO PARA AGENDAR:
1) Cliente pede para agendar/marcar/reservar → mostre serviços (list_services) se houver mais de 1, ou use o único
2) Cliente escolhe serviço → pergunte a data
3) Data definida → get_available_slots (apresente os horários de forma resumida)
4) Horário escolhido → confirme nome e telefone
5) book_appointment → confirme detalhes finais com intervalo completo

📊 COMO APRESENTAR HORÁRIOS (IMPORTANTE):
- Se houver POUCOS horários (≤8): liste todos com o formato "HH:MM às HH:MM"
- Se houver MUITOS horários (>8): apresente por PERÍODO (ex: "Manhã: 08:00 a 11:30 | Tarde: 14:00 a 17:30") e pergunte qual período o cliente prefere
- NUNCA liste mais de 10 horários de uma vez, é confuso para o cliente
- Use o campo "hint" e "available_slots_summary" da resposta para montar uma apresentação limpa

⚠️ REGRAS CRÍTICAS:
- Use funções de agendamento quando o cliente pedir: agendar, marcar, reservar, reagendar, remarcar, cancelar, **horários livres**, **horários disponíveis**, disponibilidade
- NÃO responda "vou verificar" sem chamar a ferramenta necessária
- NÃO invente horários — sempre consulte get_available_slots
- Use telefone do contexto se disponível (${context?.clientPhone || "não informado"})
- Use nome do contexto se disponível (${context?.clientName || "não informado"})`;

      messages.push({ role: "system", content: schedulingInstructions });
      console.log(`[AI Chat] Added scheduling instructions with ${services?.length || 0} services`);
    }

    let clientMemoriesText = "";
    if (context?.clientId) {
      clientMemoriesText = await getClientMemories(supabase, context.clientId);
    }

    // Get conversation context with potential summary
    const { messages: previousMessages, needsSummary } = await getConversationContext(
      supabase,
      conversationId
    );

    // If conversation is long, generate/use summary
    let summaryText = "";
    if (needsSummary) {
      const summary = await generateAndSaveSummary(supabase, conversationId, LOVABLE_API_KEY);
      if (summary) {
        summaryText = `\n\n📋 RESUMO DA CONVERSA ANTERIOR:\n${summary}`;
      }
    }

    // Add context about the client
    if (context?.clientName || context?.clientPhone || clientMemoriesText || summaryText) {
      const clientInfo = `Informações do cliente:
- Nome: ${context?.clientName || "Não informado"}
- Telefone: ${context?.clientPhone || "Não informado"}
- Status atual: ${context?.currentStatus || "Novo contato"}${clientMemoriesText}${summaryText}`;
      
      messages.push({ role: "system", content: clientInfo });
    }

    // Add previous messages for context
    if (previousMessages.length > 0) {
      messages.push(...previousMessages);
    } else if (context?.previousMessages && context.previousMessages.length > 0) {
      const recentMessages = context.previousMessages.slice(-10);
      messages.push(...recentMessages);
    }

    // ========================================================================
    // PROMPT INJECTION DETECTION
    // Check for potential prompt injection attempts before processing
    // ========================================================================
    const injectionCheck = detectPromptInjection(message);
    if (injectionCheck.detected) {
      console.warn(`[${errorRef}] PROMPT INJECTION DETECTED - Pattern: ${injectionCheck.pattern}`, {
        conversation_id: conversationId,
        message_preview: message.slice(0, 200),
        tenant_id: agentLawFirmId,
      });
      
      // Log to audit_logs for monitoring
      await supabase.from('audit_logs').insert({
        action: 'AI_INJECTION_ATTEMPT',
        entity_type: 'conversation',
        entity_id: conversationId,
        new_values: {
          pattern_detected: injectionCheck.pattern,
          message_preview: message.slice(0, 200),
          tenant_id: agentLawFirmId,
          timestamp: new Date().toISOString(),
        },
      });
      
      // Don't block - but add warning to context for the AI to handle naturally
      // The AI will respond normally but we've logged the attempt
    }

    // Add the current message with XML delimiters to reduce injection risk
    messages.push({ role: "user", content: wrapUserInput(message) });

    // Check Google Calendar integration and get available tools
    const effectiveLawFirmId = agentLawFirmId || context?.lawFirmId;
    let allTools: any[] = [];
    let calendarIntegration = { active: false, permissions: { read: false, create: false, edit: false, delete: false } };
    
    if (effectiveLawFirmId) {
      calendarIntegration = await checkCalendarIntegration(supabase, effectiveLawFirmId);
      // Get all tools (calendar if active + CRM always + scheduling if agent is scheduling type)
      allTools = getAllAvailableTools(
        calendarIntegration.active ? calendarIntegration.permissions : null,
        true, // Always include CRM tools
        isSchedulingAgent // Include scheduling tools for scheduling agents
      );
      console.log(`[AI Chat] Tools available: ${allTools.length} (Calendar: ${calendarIntegration.active ? 'yes' : 'no'}, CRM: yes, Scheduling: ${isSchedulingAgent ? 'yes' : 'no'})`);
    }

    console.log(`[AI Chat] Processing message for conversation ${conversationId}, useOpenAI: ${useOpenAI}`);
    console.log(`[AI Chat] Message count: ${messages.length}, Temperature: ${temperature}, HasKnowledge: ${!!knowledgeText}, HasMemories: ${!!clientMemoriesText}, HasSummary: ${!!summaryText}, Tools: ${allTools.length}`);

    // Build request body with optional tools
    const aiRequestBody: any = {
      messages,
      temperature,
      max_tokens: context?.audioRequested ? 900 : 400,
    };

    // Add tools if available
    if (allTools.length > 0) {
      aiRequestBody.tools = allTools;
      aiRequestBody.tool_choice = "auto";
    }

    let response;
    let aiProvider = "";
    
    if (useOpenAI && OPENAI_API_KEY) {
      // Use OpenAI API with configured model from Global Admin
      aiProvider = "OpenAI";
      console.log(`[AI Chat] Calling OpenAI API (${openaiModel}) with tools:`, allTools.length);
      aiRequestBody.model = openaiModel;
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiRequestBody),
      });
    } else {
      // Use Lovable AI (IA do Site / Internal)
      aiProvider = "Lovable AI";
      console.log("[AI Chat] Calling Lovable AI (gemini-2.5-flash) with tools:", allTools.length);
      aiRequestBody.model = "google/gemini-2.5-flash";
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiRequestBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${errorRef}] ${aiProvider} error: ${response.status}`, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again.", ref: errorRef }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service quota exceeded", ref: errorRef }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to generate AI response", ref: errorRef }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let aiMessage = data.choices?.[0]?.message;
    let aiResponse = aiMessage?.content || "";
    let toolCallsExecuted: any[] = [];

    // Handle tool calls if present
    if (aiMessage?.tool_calls && aiMessage.tool_calls.length > 0) {
      console.log(`[AI Chat] Processing ${aiMessage.tool_calls.length} tool calls`);
      
      // Execute each tool call
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];
      
      for (const toolCall of aiMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = toolCall.function.arguments;
        
        console.log(`[AI Chat] Executing tool: ${toolName}`, toolArgs);
        
        // Determine which executor to use based on tool name
        const calendarToolNames = ["check_availability", "list_events", "create_event", "update_event", "delete_event"];
        const crmToolNames = ["transfer_to_department", "change_status", "add_tag", "remove_tag", "transfer_to_responsible"];
        const schedulingToolNames = ["list_services", "get_available_slots", "book_appointment"];
        const templateToolNames = ["send_template"];
        
        let result: string;
        
        if (calendarToolNames.includes(toolName)) {
          result = await executeCalendarTool(
            supabase,
            supabaseUrl,
            supabaseKey,
            effectiveLawFirmId!,
            conversationId,
            context?.clientId,
            automationId!,
            { name: toolName, arguments: toolArgs }
          );
        } else if (crmToolNames.includes(toolName)) {
          result = await executeCrmTool(
            supabase,
            effectiveLawFirmId!,
            conversationId,
            context?.clientId,
            automationId!,
            automationName,
            { name: toolName, arguments: toolArgs },
            notifyOnTransfer
          );
        } else if (schedulingToolNames.includes(toolName)) {
          result = await executeSchedulingTool(
            supabase,
            supabaseUrl,
            supabaseKey,
            effectiveLawFirmId!,
            conversationId,
            context?.clientId,
            { name: toolName, arguments: toolArgs }
          );
        } else if (templateToolNames.includes(toolName)) {
          result = await executeTemplateTool(
            supabase,
            effectiveLawFirmId!,
            { name: toolName, arguments: toolArgs }
          );
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
        
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
        
        toolCallsExecuted.push({
          tool: toolName,
          args: JSON.parse(toolArgs),
          result: JSON.parse(result),
        });
      }
      
      // Add assistant message with tool calls and tool results
      messages.push({
        role: "assistant",
        content: aiMessage.content || "",
        tool_calls: aiMessage.tool_calls,
      } as any);
      
      for (const tr of toolResults) {
        messages.push(tr as any);
      }
      
      // Call AI again with tool results to get final response
      console.log(`[AI Chat] Calling ${aiProvider} again with tool results`);
      
      const finalRequestBody = {
        model: aiRequestBody.model,
        messages,
        temperature,
        max_tokens: 500,
      };
      
      const finalResponse = await fetch(
        useOpenAI && OPENAI_API_KEY 
          ? "https://api.openai.com/v1/chat/completions"
          : "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${useOpenAI && OPENAI_API_KEY ? OPENAI_API_KEY : LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(finalRequestBody),
        }
      );
      
      if (finalResponse.ok) {
        const finalData = await finalResponse.json();
        aiResponse = finalData.choices?.[0]?.message?.content || aiResponse;
        console.log(`[AI Chat] Final response after tool execution, length: ${aiResponse.length}`);
      }
      
      // If a template was sent, append the template content to the response
      const templateToolResult = toolCallsExecuted.find((tc: any) => tc.tool === "send_template");
      if (templateToolResult?.result?.success && templateToolResult.result.template_content) {
        console.log(`[AI Chat] Appending template content from "${templateToolResult.result.template_name}"`);
        // If AI response is empty or just acknowledgement, use template content
        // Otherwise append template after AI response
        if (!aiResponse || aiResponse.length < 20) {
          aiResponse = templateToolResult.result.template_content;
        } else {
          aiResponse = aiResponse + "\n\n" + templateToolResult.result.template_content;
        }
      }
    }

    if (!aiResponse && toolCallsExecuted.length === 0) {
      throw new Error("No response generated");
    }

    console.log(`[AI Chat] Response generated by ${aiProvider}, length: ${aiResponse.length}, toolCalls: ${toolCallsExecuted.length}`);

    // Record AI conversation usage for billing (uses agent's law_firm_id)
    const effectiveSource = source || 'web';
    
    if (effectiveLawFirmId && automationId) {
      // Fire and forget - don't block response
      recordAIConversationUsage(
        supabase,
        effectiveLawFirmId,
        conversationId,
        automationId!,
        automationName,
        effectiveSource
      ).catch(err => console.error('[AI Chat] Failed to record AI usage:', err));
    }

    // Trigger fact extraction in background if we have client info
    if (context?.clientId && context?.lawFirmId) {
      // Fire and forget - don't await
      fetch(`${supabaseUrl}/functions/v1/extract-client-facts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          conversationId,
          clientId: context.clientId,
          lawFirmId: context.lawFirmId,
        }),
      }).catch(err => console.error("[AI Chat] Failed to trigger fact extraction:", err));
    }

    // Include Tray settings in response so caller can apply department/status
    const responsePayload: any = {
      success: true,
      response: aiResponse,
      conversationId,
      toolCallsExecuted: toolCallsExecuted.length > 0 ? toolCallsExecuted : undefined,
    };
    
    // Include Tray default settings for the caller to use
    if (traySettings) {
      responsePayload.trayDefaults = {
        default_department_id: traySettings.default_department_id,
        default_status_id: traySettings.default_status_id,
        default_automation_id: traySettings.default_automation_id,
      };
    }

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    // Log actual error internally but return generic message
    console.error(`[${errorRef}] AI Chat error:`, error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request", ref: errorRef }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
