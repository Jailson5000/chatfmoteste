import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

const SAFETY_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 2000;

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);
  const loadingFinishedRef = useRef(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishLoading = useCallback(() => {
    if (!loadingFinishedRef.current) {
      loadingFinishedRef.current = true;
      setLoading(false);
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    }
  }, []);

  const fetchAdminData = useCallback(async (userId: string) => {
    if (fetchingRef.current) {
      console.log("[useAdminAuth] fetchAdminData já em andamento, ignorando chamada duplicada");
      return;
    }
    fetchingRef.current = true;
    console.log("[useAdminAuth] fetchAdminData para userId:", userId);

    try {
      // Fetch admin profile (silently ignore errors)
      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile) {
        console.log("[useAdminAuth] Admin profile encontrado:", profile.email);
        setAdminProfile(profile);
      } else {
        setAdminProfile(null);
      }

      // Fetch admin role via RPC with 1 retry
      let roleData: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase.rpc("get_admin_role", { _user_id: userId });
        if (!error && data) {
          roleData = data;
          break;
        }
        console.warn(`[useAdminAuth] Tentativa ${attempt + 1} de buscar role falhou:`, error?.message);
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }

      if (roleData) {
        console.log("[useAdminAuth] Role encontrada:", roleData);
        setAdminRole(roleData as AdminRole);
      } else {
        console.log("[useAdminAuth] Role não encontrada após retries");
        setAdminRole(null);
      }
    } catch (error: any) {
      console.error("[useAdminAuth] Exceção em fetchAdminData:", error?.message || error);
      setAdminProfile(null);
      setAdminRole(null);
    } finally {
      fetchingRef.current = false;
      finishLoading();
    }
  }, [finishLoading]);

  useEffect(() => {
    console.log("[useAdminAuth] Inicializando listener de auth...");

    // Safety net timeout
    safetyTimeoutRef.current = setTimeout(() => {
      console.warn("[useAdminAuth] Safety timeout atingido (15s), liberando loading");
      finishLoading();
    }, SAFETY_TIMEOUT_MS);

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[useAdminAuth] onAuthStateChange:", event);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchAdminData(session.user.id);
          }, 0);
        } else {
          setAdminProfile(null);
          setAdminRole(null);
          if (event === "SIGNED_OUT") {
            finishLoading();
          }
        }
      }
    );

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchAdminData(session.user.id);
      } else {
        finishLoading();
      }
    });

    return () => {
      subscription.unsubscribe();
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const loginPromise = supabase.auth.signInWithPassword({ email, password });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      );
      const { data, error } = await Promise.race([loginPromise, timeoutPromise]);
      if (error) return { error };
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
