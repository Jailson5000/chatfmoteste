import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logAuthAttempt, logAuthError, checkSupabaseConfig } from "@/lib/authDebug";

export type AdminRole = "super_admin" | "admin_operacional" | "admin_financeiro";

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
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    console.log("[useAdminAuth] Verificando sessão existente...");
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("[useAdminAuth] Erro getSession:", error.message);
      }
      console.log("[useAdminAuth] getSession:", session ? "sessão encontrada" : "sem sessão");
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchAdminData(session.user.id).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    // Debug: Check config before attempting login
    const configCheck = checkSupabaseConfig();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    logAuthAttempt("useAdminAuth.signIn START", { 
      email,
      supabaseUrl,
      endpoint: `${supabaseUrl}/auth/v1/token?grant_type=password`,
      configValid: configCheck.valid,
      configIssues: configCheck.issues,
    });
    
    if (!configCheck.valid) {
      console.error("[useAdminAuth] Config issues:", configCheck.issues);
      return { error: new Error(`Config invalid: ${configCheck.issues.join(', ')}`) };
    }
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logAuthError("useAdminAuth.signIn", error);
        return { error };
      }

      logAuthAttempt("useAdminAuth.signIn SUCCESS", { 
        hasSession: !!data.session,
        userId: data.user?.id,
      });
      return { error: null };
    } catch (error: any) {
      logAuthError("useAdminAuth.signIn EXCEPTION", error);
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAdminProfile(null);
    setAdminRole(null);
  };

  const value: AdminAuthContextType = {
    user,
    session,
    adminProfile,
    adminRole,
    loading,
    isAdmin: !!adminRole,
    isSuperAdmin: adminRole === "super_admin",
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
