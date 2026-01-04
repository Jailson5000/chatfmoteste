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

// Get all available tools (calendar + CRM)
function getAllAvailableTools(
  calendarPermissions: { read: boolean; create: boolean; edit: boolean; delete: boolean } | null,
  includeCrmTools: boolean = true
) {
  const tools: any[] = [];
  
  // Add calendar tools if integration is active
  if (calendarPermissions) {
    tools.push(...getCalendarTools(calendarPermissions));
  }
  
  // Always include CRM tools (they're tenant-scoped by design)
  if (includeCrmTools) {
    tools.push(...CRM_TOOLS);
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
  toolCall: { name: string; arguments: string }
): Promise<string> {
  try {
    const args = JSON.parse(toolCall.arguments);
    
    console.log(`[AI Chat] Executing CRM tool: ${toolCall.name}`, args);
    
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
        
        return JSON.stringify({ 
          success: true, 
          message: `Conversa transferida para o departamento ${targetDept.name}` 
        });
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
          
          return JSON.stringify({ 
            success: true, 
            message: `Conversa transferida para ${targetMember.full_name}. O atendimento agora será feito por um humano.` 
          });
          
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
          
          return JSON.stringify({ 
            success: true, 
            message: `Conversa transferida para o agente de IA ${targetAgent.name}. O novo agente continuará o atendimento.` 
          });
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
          console.log(`[AI Chat] Using OpenAI (openai_active=${iaOpenAI}, ia_site_active=${iaInternal})`);
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
      .select("id, ai_prompt, ai_temperature, name, law_firm_id, version, updated_at, trigger_config")
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

    // Extract AI role from trigger_config for audit purposes
    const triggerConfig = (automation as any).trigger_config as Record<string, unknown> | null;
    const aiRole = (triggerConfig?.role as string) || 'default';

    if (!systemPrompt) {
      console.error(`[${errorRef}] Agent has no prompt configured:`, automationId);
      return new Response(
        JSON.stringify({ error: "AI agent not properly configured", ref: errorRef }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      content: `REGRA CRÍTICA DE COMUNICAÇÃO:
- Responda como uma pessoa real em atendimento
- Envie mensagens CURTAS e OBJETIVAS (máximo 2-3 frases por vez)
- Faça UMA pergunta ou informação por mensagem
- NÃO envie textos longos ou explicações extensas
- Use linguagem natural e profissional
- Aguarde a resposta do cliente antes de continuar

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
      // Get all tools (calendar if active + CRM always)
      allTools = getAllAvailableTools(
        calendarIntegration.active ? calendarIntegration.permissions : null,
        true // Always include CRM tools
      );
      console.log(`[AI Chat] Tools available: ${allTools.length} (Calendar: ${calendarIntegration.active ? 'yes' : 'no'}, CRM: yes)`);
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
      // Use OpenAI API
      aiProvider = "OpenAI";
      console.log("[AI Chat] Calling OpenAI API (gpt-4o-mini) with tools:", allTools.length);
      aiRequestBody.model = "gpt-4o-mini";
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
