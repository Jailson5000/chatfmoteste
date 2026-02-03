import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AdminRole = "super_admin" | "admin_operacional" | "admin_financeiro";

// Timeout de segurança para evitar loading infinito
const ADMIN_AUTH_INIT_TIMEOUT_MS = 10000;

interface AdminProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface AdminAuthContextType {
  user: User | null;
  session: Session | null;
  adminProfile: AdminProfile | null;
  adminRole: AdminRole | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Flag para garantir que loading só seja setado false uma vez
  const initFinishedRef = useRef(false);

  const finishInit = (errorMsg?: string) => {
    if (initFinishedRef.current) return;
    initFinishedRef.current = true;
    if (errorMsg) {
      setError(errorMsg);
      console.error("[useAdminAuth] Init finished with error:", errorMsg);
    }
    setLoading(false);
  };

  const fetchAdminData = async (userId: string) => {
    console.log("[useAdminAuth] fetchAdminData para userId:", userId);
    try {
      // Fetch admin profile
      const { data: profile, error: profileError } = await supabase
        .from("admin_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError) {
        console.error("[useAdminAuth] Erro ao buscar admin_profiles:", profileError.message);
      }

      if (profile) {
        console.log("[useAdminAuth] Admin profile encontrado:", profile.email);
        setAdminProfile(profile);
      } else {
        console.log("[useAdminAuth] Admin profile não encontrado");
        setAdminProfile(null);
      }

      // Fetch admin role using RPC to avoid RLS issues
      console.log("[useAdminAuth] Buscando role via RPC...");
      const { data: roleData, error: roleError } = await supabase.rpc("get_admin_role", {
        _user_id: userId,
      });

      if (roleError) {
        console.error("[useAdminAuth] Erro ao buscar role:", roleError.message);
      }

      if (roleData) {
        console.log("[useAdminAuth] Role encontrada:", roleData);
        setAdminRole(roleData as AdminRole);
      } else {
        console.log("[useAdminAuth] Role não encontrada");
        setAdminRole(null);
      }
    } catch (error: any) {
      console.error("[useAdminAuth] Exceção em fetchAdminData:", error?.message || error);
      setAdminProfile(null);
      setAdminRole(null);
    }
  };

  useEffect(() => {
    console.log("[useAdminAuth] Inicializando listener de auth...");
    
    // Timeout de segurança para evitar loading infinito
    const timeoutId = setTimeout(() => {
      if (!initFinishedRef.current) {
        console.warn("[useAdminAuth] Timeout atingido após", ADMIN_AUTH_INIT_TIMEOUT_MS, "ms");
        finishInit("Tempo limite para verificar sessão. Tente recarregar a página.");
      }
    }, ADMIN_AUTH_INIT_TIMEOUT_MS);
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[useAdminAuth] onAuthStateChange:", event, "| Sessão:", session ? "presente" : "ausente");
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer Supabase calls with setTimeout
          setTimeout(() => {
            fetchAdminData(session.user.id);
          }, 0);
        } else {
          setAdminProfile(null);
          setAdminRole(null);
        }

        if (event === "SIGNED_OUT") {
          finishInit();
        }
      }
    );

    // THEN check for existing session
    console.log("[useAdminAuth] Verificando sessão existente...");
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        console.error("[useAdminAuth] Erro getSession:", sessionError.message);
        finishInit("Erro ao verificar sessão: " + sessionError.message);
        return;
      }
      
      console.log("[useAdminAuth] getSession:", session ? "sessão encontrada" : "sem sessão");
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchAdminData(session.user.id).finally(() => {
          finishInit();
        });
      } else {
        finishInit();
      }
    }).catch((err) => {
      console.error("[useAdminAuth] Exceção em getSession:", err);
      finishInit("Erro inesperado ao verificar sessão");
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error: any) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAdminProfile(null);
    setAdminRole(null);
    setError(null);
  };

  const value: AdminAuthContextType = {
    user,
    session,
    adminProfile,
    adminRole,
    loading,
    isAdmin: !!adminRole,
    isSuperAdmin: adminRole === "super_admin",
    error,
    signIn,
    signOut,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
