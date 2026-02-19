import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSyncOptional } from "@/contexts/RealtimeSyncContext";
import { DuplicateTabDialog } from "@/components/session/DuplicateTabDialog";
import { SessionTerminatedOverlay } from "@/components/session/SessionTerminatedOverlay";

// ============================================================================
// TAB SESSION CONTEXT
// ============================================================================
// Detects duplicate tabs using BroadcastChannel API
// Allows up to MAX_TABS simultaneous tabs per user
// When limit is exceeded, user can "take over" and disconnect the oldest tab
// ============================================================================

const CHANNEL_NAME = "miauchat-tab-session";
const PING_TIMEOUT_MS = 500;
const MAX_TABS = 2; // Maximum allowed simultaneous tabs

interface TabMessage {
  type: "PING" | "PONG" | "TAKEOVER";
  tabId: string;
  userId?: string;
  timestamp: number; // Tab creation timestamp for ordering
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
  // Generate unique tab ID and timestamp on mount
  const tabIdRef = useRef<string>(crypto.randomUUID());
  const tabCreatedAtRef = useRef<number>(Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeTabsRef = useRef<Map<string, number>>(new Map()); // tabId -> timestamp
  
  const [isPrimaryTab, setIsPrimaryTab] = useState(true);
  const [isTerminated, setIsTerminated] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
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
    
    // Sign out from Supabase to prevent further API calls
    // We don't actually sign out - just disconnect channels
    console.log("[TabSession] Session terminated in this tab");
  }, [realtimeSync]);

  // Handle takeover - this tab becomes primary, oldest tab is disconnected
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
    // Clear active tabs tracking for fresh start
    activeTabsRef.current.clear();
  }, [currentUserId]);

  // Handle cancel - close dialog, do nothing
  const handleCancel = useCallback(() => {
    setShowDuplicateDialog(false);
  }, []);

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
            activeTabsRef.current.set(message.tabId, message.timestamp);
            // Don't show dialog immediately - wait for timeout to count all tabs
            break;
            
          case "TAKEOVER":
            // Another tab is taking over
            // Only terminate if this tab is older than the requesting tab
            const myCreatedAt = tabCreatedAtRef.current;
            const requestingTabCreatedAt = message.timestamp;
            
            if (myCreatedAt < requestingTabCreatedAt) {
              // This tab is older, so it gets terminated
              terminateSession();
            }
            break;
        }
      };
      
      // Clear previous tracking
      activeTabsRef.current.clear();
      
      // Delay PING by 1s to avoid false-positive on F5/reload
      // (the old tab's BroadcastChannel needs time to close via beforeunload)
      setTimeout(() => {
        if (!channelRef.current) return;
        
        // Send PING to check for existing tabs
        channelRef.current.postMessage({
          type: "PING",
          tabId: tabIdRef.current,
          userId: user.id,
          timestamp: tabCreatedAtRef.current,
        } as TabMessage);
      
        // Set timeout - count PONGs received and decide
        pingTimeoutRef.current = setTimeout(() => {
        pingTimeoutRef.current = null;
        const tabCount = activeTabsRef.current.size;
        
        if (tabCount >= MAX_TABS) {
          // Limit reached - show dialog
          setShowDuplicateDialog(true);
        } else {
          // Under limit - allow this tab
          setIsPrimaryTab(true);
        }
      }, PING_TIMEOUT_MS);
      }, 1000); // 1s delay before PING
    };
    
    initChannel();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setCurrentUserId(session.user.id);
      } else if (event === "SIGNED_OUT") {
        setCurrentUserId(null);
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
      
      {/* Dialog for new tab when duplicate detected */}
      <DuplicateTabDialog
        open={showDuplicateDialog}
        onContinue={handleTakeover}
        onCancel={handleCancel}
      />
      
      {/* Overlay for old tab when terminated */}
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
