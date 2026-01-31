/**
 * Configuração centralizada de preços de adicionais
 * Estes valores devem refletir os preços definidos na landing page
 */

export const ADDITIONAL_PRICING = {
  // Preço por WhatsApp adicional (mensal)
  whatsappInstance: 57.90,
  // Preço por atendente/usuário adicional (mensal)
  user: 29.90,
  // Preço por conversa IA adicional
  aiConversation: 0.27,
  // Preço por minuto adicional de áudio TTS
  ttsMinute: 0.97,
} as const;

export interface PlanLimits {
  max_users: number;
  max_instances: number;
  max_agents: number;
  max_ai_conversations: number;
  max_tts_minutes: number;
}

export interface CompanyLimits extends PlanLimits {
  use_custom_limits: boolean;
}

export interface AdditionalBreakdown {
  users: { quantity: number; cost: number };
  instances: { quantity: number; cost: number };
  // Agentes não têm custo adicional por enquanto (inclusos no plano ou negociação)
  agents: { quantity: number; cost: number };
  aiConversations: { quantity: number; cost: number };
  ttsMinutes: { quantity: number; cost: number };
  totalAdditional: number;
}

/**
 * Calcula o custo dos recursos adicionais baseado na diferença entre
 * os limites customizados da empresa e os limites padrão do plano
 */
export function calculateAdditionalCosts(
  planLimits: PlanLimits,
  effectiveLimits: CompanyLimits,
  basePlanPrice: number
): {
  breakdown: AdditionalBreakdown;
  totalMonthly: number;
  basePlanPrice: number;
} {
  // Se não usa limites customizados, não há adicionais
  if (!effectiveLimits.use_custom_limits) {
    return {
      breakdown: {
        users: { quantity: 0, cost: 0 },
        instances: { quantity: 0, cost: 0 },
        agents: { quantity: 0, cost: 0 },
        aiConversations: { quantity: 0, cost: 0 },
        ttsMinutes: { quantity: 0, cost: 0 },
        totalAdditional: 0,
      },
      totalMonthly: basePlanPrice,
      basePlanPrice,
    };
  }

  // Calcular diferenças (apenas valores positivos = adicionais)
  const additionalUsers = Math.max(0, effectiveLimits.max_users - planLimits.max_users);
  const additionalInstances = Math.max(0, effectiveLimits.max_instances - planLimits.max_instances);
  const additionalAgents = Math.max(0, effectiveLimits.max_agents - planLimits.max_agents);
  const additionalAIConversations = Math.max(0, effectiveLimits.max_ai_conversations - planLimits.max_ai_conversations);
  const additionalTTSMinutes = Math.max(0, effectiveLimits.max_tts_minutes - planLimits.max_tts_minutes);

  // Calcular custos
  const usersCost = additionalUsers * ADDITIONAL_PRICING.user;
  const instancesCost = additionalInstances * ADDITIONAL_PRICING.whatsappInstance;
  // Agentes adicionais não têm custo definido (negociação comercial)
  const agentsCost = 0;
  // Conversas e minutos adicionais são cobrados por uso, não por limite
  // Aqui calculamos o potencial máximo se usarem todo o limite adicional
  const aiConversationsCost = additionalAIConversations * ADDITIONAL_PRICING.aiConversation;
  const ttsMinutesCost = additionalTTSMinutes * ADDITIONAL_PRICING.ttsMinute;

  const totalAdditional = usersCost + instancesCost + agentsCost;
  // Nota: aiConversationsCost e ttsMinutesCost são cobrados por uso real, não entram no fixo

  return {
    breakdown: {
      users: { quantity: additionalUsers, cost: usersCost },
      instances: { quantity: additionalInstances, cost: instancesCost },
      agents: { quantity: additionalAgents, cost: agentsCost },
      aiConversations: { quantity: additionalAIConversations, cost: aiConversationsCost },
      ttsMinutes: { quantity: additionalTTSMinutes, cost: ttsMinutesCost },
      totalAdditional,
    },
    totalMonthly: basePlanPrice + totalAdditional,
    basePlanPrice,
  };
}

/**
 * Formata um valor monetário em BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Calcula o custo variável baseado no uso real (para consumo acima do limite)
 */
export function calculateUsageOverageCost(
  currentUsage: number,
  limit: number,
  pricePerUnit: number
): { overage: number; cost: number } {
  const overage = Math.max(0, currentUsage - limit);
  return {
    overage,
    cost: overage * pricePerUnit,
  };
}
