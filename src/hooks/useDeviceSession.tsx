import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// DEVICE SESSION HOOK
// ============================================================================
// Gerencia sessões por dispositivo para impedir login simultâneo em múltiplos
// computadores/navegadores diferentes DENTRO DA MESMA EMPRESA.
// Um usuário pode logar em empresas diferentes em dispositivos diferentes.
// ============================================================================

const DEVICE_ID_KEY = "miauchat_device_id";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

// Gerar/persistir device_id único para este navegador
function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    // Fallback se localStorage não estiver disponível
    return crypto.randomUUID();
  }
}

// Detectar nome legível do dispositivo baseado no User Agent
function getDeviceName(): string {
  try {
    const ua = navigator.userAgent;
    let browser = "Navegador";
    let os = "";

    // Detectar navegador
    if (ua.includes("Firefox")) {
      browser = "Firefox";
    } else if (ua.includes("Edg")) {
      browser = "Edge";
    } else if (ua.includes("Chrome")) {
      browser = "Chrome";
    } else if (ua.includes("Safari")) {
      browser = "Safari";
    } else if (ua.includes("Opera") || ua.includes("OPR")) {
      browser = "Opera";
    }

    // Detectar sistema operacional
    if (ua.includes("Windows")) {
      os = "Windows";
    } else if (ua.includes("Mac")) {
      os = "Mac";
    } else if (ua.includes("Linux")) {
      os = "Linux";
    } else if (ua.includes("Android")) {
      os = "Android";
    } else if (ua.includes("iPhone") || ua.includes("iPad")) {
      os = "iOS";
    }

    return os ? `${browser} no ${os}` : browser;
  } catch {
    return "Navegador desconhecido";
  }
}

interface DeviceSessionState {
  hasConflict: boolean;
  conflictingDevice: string | null;
  isChecking: boolean;
  deviceId: string;
}

interface UseDeviceSessionReturn extends DeviceSessionState {
  forceLoginHere: () => Promise<void>;
  clearSession: () => Promise<void>;
  recheckSession: () => Promise<void>;
}

export function useDeviceSession(
  userId: string | null,
  lawFirmId: string | null
): UseDeviceSessionReturn {
  const [state, setState] = useState<DeviceSessionState>({
    hasConflict: false,
    conflictingDevice: null,
    isChecking: true,
    deviceId: "",
  });

  const deviceIdRef = useRef<string>("");
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Inicializar device ID
  useEffect(() => {
    deviceIdRef.current = getDeviceId();
    setState(prev => ({ ...prev, deviceId: deviceIdRef.current }));
  }, []);

  // Verificar sessão no servidor (agora filtrando por law_firm_id)
  const checkSession = useCallback(async () => {
    if (!userId || !deviceIdRef.current) {
      setState(prev => ({ ...prev, isChecking: false }));
      return;
    }

    try {
      const { data, error } = await supabase.rpc("check_device_session", {
        _user_id: userId,
        _device_id: deviceIdRef.current,
        _device_name: getDeviceName(),
        _law_firm_id: lawFirmId, // Passar law_firm_id para filtrar por empresa
      });

      if (error) {
        console.error("[DeviceSession] Error checking session:", error);
        setState(prev => ({ ...prev, isChecking: false }));
        return;
      }

      // Type guard para o retorno JSON
      const result = data as { allowed?: boolean; conflict?: boolean; conflicting_device?: string } | null;

      if (result && !result.allowed && result.conflict) {
        setState(prev => ({
          ...prev,
          hasConflict: true,
          conflictingDevice: result.conflicting_device || "Outro dispositivo",
          isChecking: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          hasConflict: false,
          conflictingDevice: null,
          isChecking: false,
        }));
      }
    } catch (err) {
      console.error("[DeviceSession] Exception:", err);
      setState(prev => ({ ...prev, isChecking: false }));
    }
  }, [userId, lawFirmId]);

  // Forçar login neste dispositivo (invalidar outros da mesma empresa)
  const forceLoginHere = useCallback(async () => {
    if (!userId || !deviceIdRef.current) return;

    try {
      // Invalidar sessões em outros dispositivos (mesma empresa)
      await supabase.rpc("invalidate_other_sessions", {
        _user_id: userId,
        _keep_device_id: deviceIdRef.current,
        _law_firm_id: lawFirmId,
      });

      // Re-registrar esta sessão
      await supabase.rpc("check_device_session", {
        _user_id: userId,
        _device_id: deviceIdRef.current,
        _device_name: getDeviceName(),
        _law_firm_id: lawFirmId,
      });

      setState(prev => ({
        ...prev,
        hasConflict: false,
        conflictingDevice: null,
      }));

      console.log("[DeviceSession] Forced login on this device");
    } catch (err) {
      console.error("[DeviceSession] Error forcing login:", err);
    }
  }, [userId, lawFirmId]);

  // Limpar sessão (logout)
  const clearSession = useCallback(async () => {
    if (!userId || !deviceIdRef.current) return;

    try {
      await supabase.rpc("clear_device_session", {
        _user_id: userId,
        _device_id: deviceIdRef.current,
        _law_firm_id: lawFirmId,
      });
      console.log("[DeviceSession] Session cleared");
    } catch (err) {
      console.error("[DeviceSession] Error clearing session:", err);
    }
  }, [userId, lawFirmId]);

  // Recheck manual
  const recheckSession = useCallback(async () => {
    setState(prev => ({ ...prev, isChecking: true }));
    await checkSession();
  }, [checkSession]);

  // Verificar sessão ao montar e quando userId/lawFirmId mudar
  useEffect(() => {
    if (userId && deviceIdRef.current) {
      checkSession();
    } else {
      setState(prev => ({ ...prev, isChecking: false }));
    }
  }, [userId, lawFirmId, checkSession]);

  // Heartbeat para manter sessão ativa
  useEffect(() => {
    if (!userId || !deviceIdRef.current || state.hasConflict) {
      return;
    }

    // Limpar heartbeat anterior
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }

    // Criar novo heartbeat
    heartbeatRef.current = setInterval(async () => {
      if (userId && deviceIdRef.current) {
        try {
          await supabase.rpc("check_device_session", {
            _user_id: userId,
            _device_id: deviceIdRef.current,
            _device_name: getDeviceName(),
            _law_firm_id: lawFirmId,
          });
        } catch (err) {
          console.error("[DeviceSession] Heartbeat error:", err);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [userId, lawFirmId, state.hasConflict]);

  return {
    ...state,
    forceLoginHere,
    clearSession,
    recheckSession,
  };
}
