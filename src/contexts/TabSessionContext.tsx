import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSyncOptional } from "@/contexts/RealtimeSyncContext";
import { DuplicateTabDialog } from "@/components/session/DuplicateTabDialog";
import { DeviceConflictDialog } from "@/components/session/DeviceConflictDialog";
import { SessionTerminatedOverlay } from "@/components/session/SessionTerminatedOverlay";
import { useDeviceSession } from "@/hooks/useDeviceSession";

// ============================================================================
// TAB SESSION CONTEXT
// ============================================================================
// Detects duplicate tabs using BroadcastChannel API (limit: 2 tabs)
// Also integrates device session protection (1 device at a time)
// ============================================================================

const CHANNEL_NAME = "miauchat-tab-session";
const PING_TIMEOUT_MS = 500;
const MAX_TABS = 2; // Limite de abas simultâneas

interface TabMessage {
  type: "PING" | "PONG" | "TAKEOVER";
  tabId: string;
  userId?: string;
  timestamp?: number; // Para ordenar abas por idade
}

interface TabSessionContextType {
  tabId: string;
  isPrimaryTab: boolean;
  isTerminated: boolean;
}

const TabSessionContext = createContext<TabSessionContextType | null>(null);

interface TabSessionProviderProps {
  children: React.ReactNode;
}

export function TabSessionProvider({ children }: TabSessionProviderProps) {
  // Generate unique tab ID on mount
  const tabIdRef = useRef<string>(crypto.randomUUID());
  const tabCreatedAtRef = useRef<number>(Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeTabsRef = useRef<Map<string, number>>(new Map());
  
  const [isPrimaryTab, setIsPrimaryTab] = useState(true);
  const [isTerminated, setIsTerminated] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Device session hook
  const {
    hasConflict: hasDeviceConflict,
    conflictingDevice,
    isChecking: isCheckingDevice,
    forceLoginHere,
    clearSession,
  } = useDeviceSession(currentUserId);
  
  // Get realtime sync context to disconnect channels
  const realtimeSync = useRealtimeSyncOptional();

  // Handle session termination
  const terminateSession = useCallback(() => {
    setIsTerminated(true);
    setIsPrimaryTab(false);
    
    // Disconnect all realtime channels
    if (realtimeSync?.disconnectAll) {
      realtimeSync.disconnectAll();
    }
    
    console.log("[TabSession] Session terminated in this tab");
  }, [realtimeSync]);

  // Handle takeover - this tab becomes primary, oldest tab disconnects
  const handleTakeover = useCallback(() => {
    if (!channelRef.current) return;
    
    channelRef.current.postMessage({
      type: "TAKEOVER",
      tabId: tabIdRef.current,
      userId: currentUserId,
      timestamp: tabCreatedAtRef.current,
    } as TabMessage);
    
    setShowDuplicateDialog(false);
    setIsPrimaryTab(true);
  }, [currentUserId]);

  // Handle cancel - close dialog, do nothing
  const handleCancel = useCallback(() => {
    setShowDuplicateDialog(false);
  }, []);

  // Handle logout for device conflict
  const handleLogout = useCallback(async () => {
    await clearSession();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }, [clearSession]);

  // Initialize BroadcastChannel
  useEffect(() => {
    // Check for BroadcastChannel support (graceful degradation)
    if (typeof BroadcastChannel === "undefined") {
      console.log("[TabSession] BroadcastChannel not supported, skipping duplicate detection");
      return;
    }

    // Get current user
    const initChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Not logged in, no need to check for duplicates
        return;
      }
      
      setCurrentUserId(user.id);
      activeTabsRef.current.clear();
      
      // Create broadcast channel
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      
      // Handle incoming messages
      channelRef.current.onmessage = (event: MessageEvent<TabMessage>) => {
        const message = event.data;
        
        // Ignore messages from self
        if (message.tabId === tabIdRef.current) return;
        
        // Ignore messages from different users
        if (message.userId && message.userId !== user.id) return;
        
        switch (message.type) {
          case "PING":
            // Another tab is checking for existing tabs
            // Respond with PONG to indicate we exist
            channelRef.current?.postMessage({
              type: "PONG",
              tabId: tabIdRef.current,
              userId: user.id,
              timestamp: tabCreatedAtRef.current,
            } as TabMessage);
            break;
            
          case "PONG":
            // Another tab responded - track it
            activeTabsRef.current.set(message.tabId, message.timestamp || Date.now());
            break;
            
          case "TAKEOVER":
            // Another tab is taking over - only terminate if we're the oldest
            const myAge = tabCreatedAtRef.current;
            const allTabs = Array.from(activeTabsRef.current.entries());
            allTabs.push([tabIdRef.current, myAge]);
            
            // Sort by timestamp (oldest first)
            allTabs.sort((a, b) => a[1] - b[1]);
            
            // Check if this tab is the oldest one
            if (allTabs.length > 0 && allTabs[0][0] === tabIdRef.current) {
              // This is the oldest tab, terminate it
              terminateSession();
            }
            break;
        }
      };
      
      // Send PING to check for existing tabs
      channelRef.current.postMessage({
        type: "PING",
        tabId: tabIdRef.current,
        userId: user.id,
        timestamp: tabCreatedAtRef.current,
      } as TabMessage);
      
      // Set timeout - after collecting PONGs, check if limit exceeded
      pingTimeoutRef.current = setTimeout(() => {
        pingTimeoutRef.current = null;
        const tabCount = activeTabsRef.current.size;
        
        if (tabCount >= MAX_TABS) {
          // Limit reached - show dialog
          setShowDuplicateDialog(true);
        } else {
          // Under limit - we're good
          setIsPrimaryTab(true);
        }
      }, PING_TIMEOUT_MS);
    };
    
    initChannel();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setCurrentUserId(session.user.id);
      } else if (event === "SIGNED_OUT") {
        setCurrentUserId(null);
        activeTabsRef.current.clear();
      }
    });
    
    // Cleanup
    return () => {
      if (pingTimeoutRef.current) {
        clearTimeout(pingTimeoutRef.current);
      }
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [terminateSession]);

  const value: TabSessionContextType = {
    tabId: tabIdRef.current,
    isPrimaryTab,
    isTerminated,
  };

  return (
    <TabSessionContext.Provider value={value}>
      {children}
      
      {/* Dialog for tab limit exceeded */}
      <DuplicateTabDialog
        open={showDuplicateDialog && !hasDeviceConflict}
        onContinue={handleTakeover}
        onCancel={handleCancel}
      />
      
      {/* Dialog for device conflict */}
      <DeviceConflictDialog
        open={hasDeviceConflict && !isCheckingDevice}
        conflictingDevice={conflictingDevice}
        onContinueHere={forceLoginHere}
        onLogout={handleLogout}
      />
      
      {/* Overlay for terminated tab */}
      {isTerminated && <SessionTerminatedOverlay />}
    </TabSessionContext.Provider>
  );
}

export function useTabSession() {
  const context = useContext(TabSessionContext);
  if (!context) {
    throw new Error("useTabSession must be used within a TabSessionProvider");
  }
  return context;
}

export function useTabSessionOptional() {
  return useContext(TabSessionContext);
}
