import { useEffect, useState, useCallback, useRef } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  must_change_password: boolean;
}

// Token refresh margin: refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_SECONDS = 300;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const { toast } = useToast();
  
  // Refs to track refresh state and prevent duplicate operations
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  // Handle session expiration - auto logout
  const handleSessionExpired = useCallback(async (reason: string = "Sessão expirada") => {
    console.log("[useAuth] Sessão expirada:", reason);
    
    // Clear local state
    setSession(null);
    setUser(null);
    setMustChangePassword(false);
    
    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    // Sign out from Supabase (clears tokens)
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[useAuth] Erro ao fazer signOut:", e);
    }
    
    // Notify user
    toast({
      title: "Sessão expirada",
      description: "Por favor, faça login novamente.",
      variant: "destructive",
    });
  }, [toast]);

  // Proactive token refresh before expiry
  const scheduleTokenRefresh = useCallback((currentSession: Session) => {
    // Clear any existing refresh timer
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    if (!currentSession?.expires_at) {
      console.log("[useAuth] Sessão sem expires_at, refresh não agendado");
      return;
    }

    const expiresAt = currentSession.expires_at * 1000; // Convert to ms
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const refreshTime = timeUntilExpiry - (TOKEN_REFRESH_MARGIN_SECONDS * 1000);

    console.log("[useAuth] Token expira em:", Math.round(timeUntilExpiry / 1000), "segundos");
    console.log("[useAuth] Refresh agendado para:", Math.round(refreshTime / 1000), "segundos");

    if (refreshTime <= 0) {
      // Token already expired or about to expire, refresh immediately
      console.log("[useAuth] Token próximo de expirar, refreshing agora...");
      refreshToken();
      return;
    }

    refreshTimeoutRef.current = setTimeout(() => {
      console.log("[useAuth] Executando refresh agendado...");
      refreshToken();
    }, refreshTime);
  }, []);

  // Refresh the token
  const refreshToken = useCallback(async () => {
    if (isRefreshingRef.current) {
      console.log("[useAuth] Refresh já em andamento, ignorando...");
      return;
    }

    isRefreshingRef.current = true;
    console.log("[useAuth] Iniciando refresh de token...");

    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error("[useAuth] Erro ao refresh:", error.message);
        
        // Check if it's a fatal error (token completely invalid)
        if (isAuthErrorFatal(error)) {
          await handleSessionExpired("Token inválido");
        }
        return;
      }

      if (data.session) {
        console.log("[useAuth] Token refreshed com sucesso");
        setSession(data.session);
        setUser(data.session.user);
        // Schedule next refresh
        scheduleTokenRefresh(data.session);
      } else {
        console.log("[useAuth] Refresh retornou sem sessão");
        await handleSessionExpired("Refresh sem sessão");
      }
    } catch (err) {
      console.error("[useAuth] Exceção no refresh:", err);
      await handleSessionExpired("Erro no refresh");
    } finally {
      isRefreshingRef.current = false;
    }
  }, [handleSessionExpired, scheduleTokenRefresh]);

  // Check if an auth error is fatal (requires re-login)
  const isAuthErrorFatal = (error: AuthError): boolean => {
    const fatalMessages = [
      'invalid_grant',
      'invalid claim',
      'missing sub claim',
      'bad_jwt',
      'session_not_found',
      'refresh_token_not_found',
    ];
    
    const errorStr = `${error.message} ${error.code || ''}`.toLowerCase();
    return fatalMessages.some(msg => errorStr.includes(msg.toLowerCase()));
  };

  // Handle API errors that might indicate token issues
  const handleApiError = useCallback(async (error: any) => {
    if (!error) return false;
    
    const errorMessage = error?.message || error?.error_description || String(error);
    const statusCode = error?.status || error?.code;
    
    // Check for auth-related errors
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      errorMessage.includes('JWT') ||
      errorMessage.includes('token') ||
      errorMessage.includes('session') ||
      errorMessage.includes('unauthorized')
    ) {
      console.log("[useAuth] API retornou erro de auth:", errorMessage);
      
      // Try to refresh first
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) {
          await handleSessionExpired("API rejeitou token");
          return true;
        }
        console.log("[useAuth] Token refreshed após erro de API");
        return false;
      } catch (e) {
        await handleSessionExpired("Falha no refresh após erro");
        return true;
      }
    }
    
    return false;
  }, [handleSessionExpired]);

  useEffect(() => {
    console.log("[useAuth] Inicializando listener de auth...");
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log("[useAuth] onAuthStateChange:", event, "| Sessão:", currentSession ? "presente" : "ausente");
        
        // Handle specific events
        switch (event) {
          case 'SIGNED_OUT':
            console.log("[useAuth] Usuário deslogado");
            setSession(null);
            setUser(null);
            setMustChangePassword(false);
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
              refreshTimeoutRef.current = null;
            }
            break;
            
          case 'TOKEN_REFRESHED':
            console.log("[useAuth] Token foi refreshed automaticamente");
            if (currentSession) {
              setSession(currentSession);
              setUser(currentSession.user);
              scheduleTokenRefresh(currentSession);
            }
            break;
            
          case 'SIGNED_IN':
          case 'INITIAL_SESSION':
            if (currentSession) {
              setSession(currentSession);
              setUser(currentSession.user);
              scheduleTokenRefresh(currentSession);
              
              // Check must_change_password flag (deferred to avoid deadlock)
              setTimeout(async () => {
                console.log("[useAuth] Buscando profile para must_change_password...");
                const { data: profile, error } = await supabase
                  .from('profiles')
                  .select('must_change_password')
                  .eq('id', currentSession.user.id)
                  .maybeSingle();
                
                if (error) {
                  // Check if error is auth-related
                  const isAuthError = await handleApiError(error);
                  if (!isAuthError) {
                    console.error("[useAuth] Erro ao buscar profile:", error.message);
                  }
                  return;
                }
                
                if (profile?.must_change_password) {
                  console.log("[useAuth] Usuário precisa trocar senha");
                  setMustChangePassword(true);
                } else {
                  setMustChangePassword(false);
                }
              }, 0);
            } else {
              setSession(null);
              setUser(null);
            }
            break;
            
          default:
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session
    console.log("[useAuth] Verificando sessão existente...");
    supabase.auth.getSession().then(({ data: { session: existingSession }, error }) => {
      if (error) {
        console.error("[useAuth] Erro ao obter sessão:", error.message);
        // Clear invalid session/token if there's an error
        console.log("[useAuth] Limpando sessão inválida...");
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      
      console.log("[useAuth] getSession resultado:", existingSession ? "sessão encontrada" : "sem sessão");
      
      if (existingSession) {
        setSession(existingSession);
        setUser(existingSession.user);
        scheduleTokenRefresh(existingSession);
      } else {
        setSession(null);
        setUser(null);
      }
      
      setLoading(false);
    });

    // Cleanup on unmount
    return () => {
      subscription.unsubscribe();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [scheduleTokenRefresh, handleApiError]);

  const clearMustChangePassword = async () => {
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
      
      if (error) {
        await handleApiError(error);
      } else {
        setMustChangePassword(false);
      }
    }
  };

  // Manual sign out
  const signOut = useCallback(async () => {
    console.log("[useAuth] signOut manual iniciado");
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    await supabase.auth.signOut();
  }, []);

  return { 
    user, 
    session, 
    loading, 
    mustChangePassword, 
    clearMustChangePassword,
    signOut,
    refreshToken,
    handleApiError,
  };
}