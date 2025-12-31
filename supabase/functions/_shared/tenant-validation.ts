/**
 * Shared Tenant Validation for Edge Functions
 * 
 * SECURITY: This module provides backend validation for multi-tenant isolation.
 * All tenant-specific Edge Functions MUST use these utilities.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TenantContext {
  lawFirmId: string;
  subdomain: string;
  companyId: string;
  companyName: string;
  approvalStatus: string;
}

export interface UserTenantInfo {
  userId: string;
  email: string;
  lawFirmId: string;
  subdomain: string | null;
}

/**
 * Extract subdomain from the Origin or Referer header
 * Examples:
 *   https://empresa-a.miauchat.com.br -> empresa-a
 *   https://www.miauchat.com.br -> null (main domain)
 *   https://miauchat.com.br -> null (main domain)
 */
export function extractSubdomainFromOrigin(origin: string | null, referer: string | null): string | null {
  const url = origin || referer;
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    // Check if it's our domain
    if (!host.endsWith('.miauchat.com.br') && host !== 'miauchat.com.br' && host !== 'www.miauchat.com.br') {
      // Could be localhost or preview domain - skip tenant validation
      return null;
    }

    // Main domain variations
    if (host === 'miauchat.com.br' || host === 'www.miauchat.com.br') {
      return null;
    }

    // Extract subdomain: empresa-a.miauchat.com.br -> empresa-a
    const parts = host.split('.');
    if (parts.length >= 3) {
      return parts[0];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get tenant context from subdomain
 * Returns null if subdomain doesn't exist or company is not approved
 */
export async function getTenantFromSubdomain(
  supabase: SupabaseClient,
  subdomain: string
): Promise<TenantContext | null> {
  const { data: lawFirm, error: lawFirmError } = await supabase
    .from('law_firms')
    .select('id, subdomain')
    .eq('subdomain', subdomain)
    .single();

  if (lawFirmError || !lawFirm) {
    console.warn(`[TenantValidation] Law firm not found for subdomain: ${subdomain}`);
    return null;
  }

  // Get company info
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, approval_status')
    .eq('law_firm_id', lawFirm.id)
    .single();

  if (companyError || !company) {
    console.warn(`[TenantValidation] Company not found for law_firm_id: ${lawFirm.id}`);
    return null;
  }

  return {
    lawFirmId: lawFirm.id,
    subdomain: lawFirm.subdomain,
    companyId: company.id,
    companyName: company.name,
    approvalStatus: company.approval_status,
  };
}

/**
 * Get user's tenant information from their profile
 */
export async function getUserTenantInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<UserTenantInfo | null> {
  // First get profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, law_firm_id')
    .eq('id', userId)
    .single();

  if (profileError || !profile || !profile.law_firm_id) {
    console.warn(`[TenantValidation] Profile or law_firm_id not found for user: ${userId}`);
    return null;
  }

  // Then get law_firm subdomain
  const { data: lawFirm, error: lawFirmError } = await supabase
    .from('law_firms')
    .select('subdomain')
    .eq('id', profile.law_firm_id)
    .single();

  return {
    userId: profile.id,
    email: profile.email,
    lawFirmId: profile.law_firm_id,
    subdomain: lawFirm?.subdomain || null,
  };
}

/**
 * CRITICAL: Validate that user belongs to the tenant they're accessing
 * 
 * @param userTenant - User's tenant info from their profile
 * @param requestSubdomain - Subdomain from the request origin/referer
 * @returns true if access is allowed, false otherwise
 */
export function validateTenantAccess(
  userTenant: UserTenantInfo,
  requestSubdomain: string | null
): boolean {
  // If no subdomain in request (main domain or preview), check if user has a required subdomain
  if (!requestSubdomain) {
    // User has a subdomain - they MUST access via their subdomain
    if (userTenant.subdomain) {
      console.warn(
        `[TenantValidation] BLOCKED: User ${userTenant.email} with subdomain ${userTenant.subdomain} tried to access main domain`
      );
      return false;
    }
    // User without subdomain - allow main domain access (legacy users or special cases)
    return true;
  }

  // Request has subdomain - validate it matches user's subdomain
  if (userTenant.subdomain !== requestSubdomain) {
    console.warn(
      `[TenantValidation] BLOCKED: User ${userTenant.email} (subdomain: ${userTenant.subdomain}) tried to access subdomain: ${requestSubdomain}`
    );
    return false;
  }

  return true;
}

/**
 * Log security event for audit trail
 */
export async function logTenantSecurityEvent(
  supabase: SupabaseClient,
  event: {
    userId: string;
    email: string;
    action: string;
    expectedSubdomain: string | null;
    requestSubdomain: string | null;
    ipAddress?: string;
    userAgent?: string;
    blocked: boolean;
  }
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: event.userId,
      action: event.action,
      entity_type: 'tenant_security',
      entity_id: null,
      old_values: {
        expected_subdomain: event.expectedSubdomain,
      },
      new_values: {
        request_subdomain: event.requestSubdomain,
        blocked: event.blocked,
        email: event.email,
      },
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
    });
  } catch (err) {
    console.error('[TenantValidation] Failed to log security event:', err);
  }
}

/**
 * Complete tenant validation middleware for Edge Functions
 * 
 * Usage:
 * ```typescript
 * const validation = await validateRequestTenant(supabase, req, userId);
 * if (!validation.allowed) {
 *   return new Response(JSON.stringify({ error: validation.reason }), { 
 *     status: validation.statusCode,
 *     headers: corsHeaders 
 *   });
 * }
 * // validation.tenant contains the tenant context
 * ```
 */
export async function validateRequestTenant(
  supabase: SupabaseClient,
  req: Request,
  userId: string
): Promise<{
  allowed: boolean;
  statusCode: number;
  reason: string;
  tenant?: TenantContext;
  userTenant?: UserTenantInfo;
}> {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const requestSubdomain = extractSubdomainFromOrigin(origin, referer);

  // Get user's tenant info
  const userTenant = await getUserTenantInfo(supabase, userId);
  if (!userTenant) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Usuário não está vinculado a nenhuma empresa.',
    };
  }

  // Validate tenant access
  const accessAllowed = validateTenantAccess(userTenant, requestSubdomain);
  if (!accessAllowed) {
    // Log security event
    await logTenantSecurityEvent(supabase, {
      userId,
      email: userTenant.email,
      action: 'tenant_access_denied',
      expectedSubdomain: userTenant.subdomain,
      requestSubdomain,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      blocked: true,
    });

    return {
      allowed: false,
      statusCode: 403,
      reason: 'Acesso negado. Você não tem permissão para acessar este subdomínio.',
      userTenant,
    };
  }

  // Get full tenant context if subdomain is provided
  let tenant: TenantContext | undefined;
  if (userTenant.subdomain) {
    const tenantContext = await getTenantFromSubdomain(supabase, userTenant.subdomain);
    if (!tenantContext) {
      return {
        allowed: false,
        statusCode: 404,
        reason: 'Empresa não encontrada.',
        userTenant,
      };
    }

    if (tenantContext.approvalStatus !== 'approved') {
      return {
        allowed: false,
        statusCode: 403,
        reason: 'Sua empresa ainda não foi aprovada.',
        userTenant,
      };
    }

    tenant = tenantContext;
  }

  return {
    allowed: true,
    statusCode: 200,
    reason: 'OK',
    tenant,
    userTenant,
  };
}

/**
 * Validate that a law_firm_id belongs to the expected tenant
 * Use this for data operations to prevent IDOR attacks
 */
export function validateResourceBelongsToTenant(
  resourceLawFirmId: string,
  expectedLawFirmId: string
): boolean {
  if (resourceLawFirmId !== expectedLawFirmId) {
    console.warn(
      `[TenantValidation] IDOR BLOCKED: Resource law_firm_id ${resourceLawFirmId} does not match expected ${expectedLawFirmId}`
    );
    return false;
  }
  return true;
}
