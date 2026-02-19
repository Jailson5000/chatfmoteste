import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// Token refresh margin: refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_SECONDS = 300;

// Timeout de segurança: evita loading infinito caso o SDK trave na inicialização
const AUTH_INIT_TIMEOUT_MS = 10000;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  mustChangePassword: boolean;
  clearMustChangePassword: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
  handleApiError: (error: any) => Promise<boolean>;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------- Provider (mounted ONCE at the top of the tree) ----------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  const queryClient = useQueryClient();

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
    setSession(null);
    setUser(null);
    setMustChangePassword(false);
    setSessionExpired(true);
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
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
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    if (!currentSession?.expires_at) {
      console.log("[useAuth] Sessão sem expires_at, refresh não agendado");
      return;
    }
    const expiresAt = currentSession.expires_at * 1000;
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const refreshTime = timeUntilExpiry - (TOKEN_REFRESH_MARGIN_SECONDS * 1000);

    console.log("[useAuth] Token expira em:", Math.round(timeUntilExpiry / 1000), "segundos");
    console.log("[useAuth] Refresh agendado para:", Math.round(refreshTime / 1000), "segundos");

    if (refreshTime <= 0) {
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
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      errorMessage.includes('JWT') ||
      errorMessage.includes('token') ||
      errorMessage.includes('session') ||
      errorMessage.includes('unauthorized')
    ) {
      console.log("[useAuth] API retornou erro de auth:", errorMessage);
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

  // ---------- Single auth listener + cache invalidation ----------
  useEffect(() => {
    console.log("[useAuth] Inicializando listener de auth (singleton)...");

    let finished = false;
    let initTimeout: ReturnType<typeof setTimeout> | null = null;

    const finishLoading = () => {
      if (finished) return;
      finished = true;
      if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
      }
      setLoading(false);
    };

    initTimeout = setTimeout(() => {
      if (finished) return;
      console.warn("[useAuth] Timeout na inicialização de auth - liberando UI");
      setSession(null);
      setUser(null);
      setMustChangePassword(false);
      finishLoading();
    }, AUTH_INIT_TIMEOUT_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log("[useAuth] onAuthStateChange:", event, "| Sessão:", currentSession ? "presente" : "ausente");

        switch (event) {
          case 'SIGNED_OUT':
            console.log("[useAuth] Usuário deslogado — limpando cache");
            setSession(null);
            setUser(null);
            setMustChangePassword(false);
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
              refreshTimeoutRef.current = null;
            }
            // Cache invalidation (replaces AuthCacheInvalidator)
            queryClient.clear();
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

              // Cache invalidation on sign-in (replaces AuthCacheInvalidator)
              if (event === 'SIGNED_IN') {
                console.log("[useAuth] SIGNED_IN — invalidando queries");
                queryClient.invalidateQueries();
              }

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
                setMustChangePassword(!!profile?.must_change_password);
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

        finishLoading();
      }
    );

    console.log("[useAuth] Verificando sessão existente...");
    supabase.auth.getSession()
      .then(({ data: { session: existingSession }, error }) => {
        if (error) {
          console.error("[useAuth] Erro ao obter sessão:", error.message);
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
          supabase.auth.signOut().catch(() => {});
          setSession(null);
          setUser(null);
          finishLoading();
          return;
        }

        console.log("[useAuth] getSession resultado:", existingSession ? "sessão encontrada" : "sem sessão");

        if (existingSession) {
          if (!existingSession.user?.id || !existingSession.access_token) {
            console.log("[useAuth] Sessão incompleta, limpando...");
            supabase.auth.signOut().catch(() => {});
            setSession(null);
            setUser(null);
            finishLoading();
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
        finishLoading();
      })
      .catch((err) => {
        console.error("[useAuth] Exceção ao obter sessão:", err);
        setSession(null);
        setUser(null);
        finishLoading();
      });

    return () => {
      subscription.unsubscribe();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
    };
  }, [scheduleTokenRefresh, queryClient]);

  const clearMustChangePassword = useCallback(async () => {
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
  }, [user, handleApiError]);

  const signOut = useCallback(async () => {
    console.log("[useAuth] signOut manual iniciado");
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    await supabase.auth.signOut();
  }, []);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const value: AuthContextType = {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------- Consumer hook (zero listeners, zero timers) ----------

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
