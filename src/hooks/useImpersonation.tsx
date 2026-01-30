import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImpersonationState {
  isImpersonating: boolean;
  adminId: string | null;
  companyName: string | null;
  targetUserId: string | null;
}

const IMPERSONATION_KEY = "miauchat_impersonation";

export function useImpersonation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ImpersonationState>(() => {
    // Check localStorage for existing impersonation state
    const stored = localStorage.getItem(IMPERSONATION_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return {
          isImpersonating: false,
          adminId: null,
          companyName: null,
          targetUserId: null,
        };
      }
    }
    return {
      isImpersonating: false,
      adminId: null,
      companyName: null,
      targetUserId: null,
    };
  });

  // Check URL params for impersonation markers on mount
  useEffect(() => {
    const isImpersonating = searchParams.get("impersonating") === "true";
    const adminId = searchParams.get("admin_id") || searchParams.get("admin");
    const companyName = searchParams.get("company_name");

    if (isImpersonating && adminId) {
      const newState: ImpersonationState = {
        isImpersonating: true,
        adminId,
        companyName: companyName ? decodeURIComponent(companyName) : state.companyName,
        targetUserId: null,
      };
      
      setState(newState);
      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(newState));

      // Clean up URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("impersonating");
      newParams.delete("admin_id");
      newParams.delete("admin");
      newParams.delete("company_name");
      newParams.delete("company");
      setSearchParams(newParams, { replace: true });

      toast.info(`Você está acessando como administrador`, {
        description: companyName ? `Empresa: ${decodeURIComponent(companyName)}` : undefined,
        duration: 5000,
      });
    }
  }, [searchParams, setSearchParams]);

  // Start impersonation (called from GlobalAdmin)
  const startImpersonation = useCallback(async (targetUserId: string, companyId?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Você precisa estar logado como admin global");
        return { success: false, error: "Not authenticated" };
      }

      const response = await supabase.functions.invoke("impersonate-user", {
        body: { target_user_id: targetUserId, company_id: companyId },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to impersonate");
      }

      // Open the impersonation URL in a new tab
      const impersonationUrl = response.data.url;
      window.open(impersonationUrl, "_blank");

      toast.success(`Abrindo sessão como ${response.data.target_user?.name || "cliente"}`, {
        description: `Empresa: ${response.data.company_name}`,
      });

      return { success: true, url: impersonationUrl };
    } catch (error: any) {
      console.error("[useImpersonation] Error:", error);
      toast.error(`Erro ao acessar como cliente: ${error.message}`);
      return { success: false, error: error.message };
    }
  }, []);

  // End impersonation (called from banner)
  const endImpersonation = useCallback(async () => {
    try {
      // Sign out from the impersonated session
      await supabase.auth.signOut();
      
      // Clear the impersonation state
      localStorage.removeItem(IMPERSONATION_KEY);
      setState({
        isImpersonating: false,
        adminId: null,
        companyName: null,
        targetUserId: null,
      });

      toast.success("Sessão de impersonation encerrada");
      
      // Redirect to login or close tab
      window.close();
      
      // If window didn't close (e.g., not opened via script), redirect to login
      setTimeout(() => {
        navigate("/auth");
      }, 500);
    } catch (error: any) {
      console.error("[useImpersonation] Error ending session:", error);
      toast.error("Erro ao encerrar sessão");
    }
  }, [navigate]);

  return {
    ...state,
    startImpersonation,
    endImpersonation,
  };
}
