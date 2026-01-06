import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// MULTI-TENANT HOOK - Detecção de Tenant por Subdomínio
// ============================================================================
// 
// Este hook é responsável por:
// 1. Detectar o subdomínio atual da URL
// 2. Buscar o tenant (law_firm) correspondente no banco de dados
// 3. Fornecer o contexto do tenant para toda a aplicação
//
// ============================================================================

interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  logoUrl: string | null;
  email: string | null;
}

interface TenantContextType {
  tenant: TenantInfo | null;
  isLoading: boolean;
  error: string | null;
  subdomain: string | null;
  isMainDomain: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  isLoading: true,
  error: null,
  subdomain: null,
  isMainDomain: true,
});

// ============================================================================
// CONFIGURAÇÃO DE DOMÍNIOS
// ============================================================================
// 
// PRODUÇÃO:     miauchat.com.br
// STAGING:      staging.miauchat.com.br
// DESENVOLVIMENTO: localhost
//
// ============================================================================

const MAIN_DOMAINS = [
  'miauchat.com.br',
  'www.miauchat.com.br',
  'staging.miauchat.com.br',
  'localhost',
];
const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'app',
  'admin',
  'staging',
  'dev',
  'mail',
  'smtp',
  'ftp',
  'cdn',
  'assets',
  'static',
  'support',
  'help',
  'docs',
  'blog',
];

/**
 * Extrai o subdomínio da URL atual
 * 
 * Exemplos:
 * - empresa.miauchat.com.br -> "empresa"
 * - www.miauchat.com.br -> null (domínio principal)
 * - miauchat.com.br -> null (domínio principal)
 * - localhost:5173 -> null (desenvolvimento)
 */
export function extractSubdomain(hostname: string): string | null {
  // Remove porta se existir
  const host = hostname.split(':')[0];
  
  // Verifica se é localhost (desenvolvimento)
  if (host === 'localhost') {
    // Em desenvolvimento, podemos simular subdomínio via query param
    // Ex: localhost:5173?tenant=empresa
    return null;
  }
  
  // Verifica se é um dos domínios principais
  if (MAIN_DOMAINS.includes(host)) {
    return null;
  }
  
  // Extrai subdomínio para domínios .com.br (3 partes após o subdomínio)
  // empresa.miauchat.com.br -> ["empresa", "miauchat", "com", "br"]
  const parts = host.split('.');
  
  if (parts.length >= 4 && parts[parts.length - 1] === 'br' && parts[parts.length - 2] === 'com') {
    const subdomain = parts[0];
    
    // Verifica se não é um subdomínio reservado
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return null;
    }
    
    return subdomain.toLowerCase();
  }
  
  // Para domínios .com (2 partes após o subdomínio)
  // empresa.miauchat.com -> ["empresa", "miauchat", "com"]
  if (parts.length >= 3) {
    const subdomain = parts[0];
    
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return null;
    }
    
    return subdomain.toLowerCase();
  }
  
  return null;
}

/**
 * Valida formato do subdomínio
 * - Apenas letras minúsculas, números e hífens
 * - Não pode começar ou terminar com hífen
 * - Mínimo 2 caracteres, máximo 63
 */
export function isValidSubdomain(subdomain: string): boolean {
  const regex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  return regex.test(subdomain) && subdomain.length >= 2 && subdomain.length <= 63;
}

/**
 * Gera subdomínio a partir do nome da empresa
 * - Remove caracteres especiais
 * - Converte para minúsculas
 * - Substitui espaços por hífens
 */
export function generateSubdomainFromName(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .replace(/^-|-$/g, '') // Remove hífens do início/fim
    .slice(0, 63); // Limita a 63 caracteres
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    const detectTenant = async () => {
      try {
        const hostname = window.location.hostname;
        const detectedSubdomain = extractSubdomain(hostname);
        
        // Em desenvolvimento, permite simular via query param
        const urlParams = new URLSearchParams(window.location.search);
        const tenantParam = urlParams.get('tenant');
        
        const finalSubdomain = detectedSubdomain || tenantParam;
        setSubdomain(finalSubdomain);
        
        if (!finalSubdomain) {
          // Domínio principal - sem tenant específico
          setIsLoading(false);
          return;
        }
        
        // Busca tenant pelo subdomínio
        const { data, error: fetchError } = await supabase
          .from('law_firms')
          .select('id, name, subdomain, logo_url, email')
          .eq('subdomain', finalSubdomain)
          .single();
        
        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            // Tenant não encontrado
            setError(`Empresa "${finalSubdomain}" não encontrada.`);
          } else {
            setError('Erro ao carregar dados da empresa.');
          }
          setIsLoading(false);
          return;
        }
        
        setTenant({
          id: data.id,
          name: data.name,
          subdomain: data.subdomain,
          logoUrl: data.logo_url,
          email: data.email,
        });
        setIsLoading(false);
        
      } catch (err) {
        console.error('Erro na detecção de tenant:', err);
        setError('Erro inesperado ao detectar empresa.');
        setIsLoading(false);
      }
    };
    
    detectTenant();
  }, []);

  const isMainDomain = !subdomain;

  return (
    <TenantContext.Provider value={{ tenant, isLoading, error, subdomain, isMainDomain }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant deve ser usado dentro de um TenantProvider');
  }
  return context;
}

// ============================================================================
// UTILITÁRIOS PARA GERENCIAMENTO DE SUBDOMÍNIOS
// ============================================================================

/**
 * Verifica se um subdomínio está disponível
 */
export async function checkSubdomainAvailability(subdomain: string): Promise<boolean> {
  if (!isValidSubdomain(subdomain)) {
    return false;
  }
  
  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return false;
  }
  
  const { data, error } = await supabase
    .from('law_firms')
    .select('id')
    .eq('subdomain', subdomain.toLowerCase())
    .single();
  
  // Se não encontrou, está disponível
  return error?.code === 'PGRST116';
}

/**
 * Atualiza o subdomínio de uma empresa
 */
export async function updateLawFirmSubdomain(
  lawFirmId: string, 
  subdomain: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidSubdomain(subdomain)) {
    return { success: false, error: 'Formato de subdomínio inválido' };
  }
  
  const isAvailable = await checkSubdomainAvailability(subdomain);
  if (!isAvailable) {
    return { success: false, error: 'Subdomínio já está em uso ou é reservado' };
  }
  
  const { error } = await supabase
    .from('law_firms')
    .update({ subdomain: subdomain.toLowerCase() })
    .eq('id', lawFirmId);
  
  if (error) {
    return { success: false, error: 'Erro ao atualizar subdomínio' };
  }
  
  return { success: true };
}

/**
 * Gera URL completa para um tenant
 */
export function getTenantUrl(subdomain: string, path: string = '/'): string {
  // Em produção
  if (typeof window !== 'undefined' && window.location.hostname.includes('miauchat.com.br')) {
    return `https://${subdomain}.miauchat.com.br${path}`;
  }
  
  // Em desenvolvimento - usa query param
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${baseUrl}${path}?tenant=${subdomain}`;
}
