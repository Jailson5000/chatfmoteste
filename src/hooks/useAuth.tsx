import { useEffect, useState, useCallback, useRef } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Token refresh margin: refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_SECONDS = 300;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  
  // Refs to track refresh state and prevent duplicate operations
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  // Check if an auth error is fatal (requires re-login)
  const isAuthErrorFatal = useCallback((error: AuthError): boolean => {
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
  }, []);

  // Handle session expiration - auto logout
  const handleSessionExpired = useCallback(async (reason: string = "Sessão expirada") => {
    console.log("[useAuth] Sessão expirada:", reason);
    
    // Clear local state
    setSession(null);
    setUser(null);
    setMustChangePassword(false);
    setSessionExpired(true);
    
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
        setSessionExpired(false);
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
  }, [handleSessionExpired, isAuthErrorFatal]);

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
  }, [refreshToken]);

  // Handle API errors that might indicate token issues
  const handleApiError = useCallback(async (error: any): Promise<boolean> => {
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
        setSession(data.session);
        setUser(data.session.user);
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
              setSessionExpired(false);
              scheduleTokenRefresh(currentSession);
            }
            break;
            
          case 'SIGNED_IN':
          case 'INITIAL_SESSION':
            if (currentSession) {
              setSession(currentSession);
              setUser(currentSession.user);
              setSessionExpired(false);
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
                  console.error("[useAuth] Erro ao buscar profile:", error.message);
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
    supabase.auth.getSession().then(async ({ data: { session: existingSession }, error }) => {
      if (error) {
        console.error("[useAuth] Erro ao obter sessão:", error.message);
        // Clear invalid session/token if there's an error
        console.log("[useAuth] Limpando sessão inválida...");
        
        // Force clear localStorage tokens
        try {
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            if (key.includes('supabase') || key.includes('sb-')) {
              localStorage.removeItem(key);
            }
          });
        } catch (e) {
          console.error("[useAuth] Erro ao limpar localStorage:", e);
        }
        
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      
      console.log("[useAuth] getSession resultado:", existingSession ? "sessão encontrada" : "sem sessão");
      
      if (existingSession) {
        // Validate the session has required fields
        if (!existingSession.user?.id || !existingSession.access_token) {
          console.log("[useAuth] Sessão incompleta, limpando...");
          await supabase.auth.signOut().catch(() => {});
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        
        setSession(existingSession);
        setUser(existingSession.user);
        setSessionExpired(false);
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
  }, [scheduleTokenRefresh]);

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

  // Clear session expired flag (for UI to reset after showing message)
  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
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
    sessionExpired,
    clearSessionExpired,
  };
}