/**
 * MiauChat Widget v2.1
 * Widget de chat embarcável para sites externos
 * - Design moderno estilo JivoChat
 * - Widget arrastável
 * - Polling para receber mensagens do atendente
 * - Alertas visuais e sonoros para novas mensagens
 * 
 * Uso (Método 1 - window.MiauChat):
 * <script>
 *   window.MiauChat = { tenant: "SUA_WIDGET_KEY" };
 * </script>
 * <script async src="https://miauchat.com.br/widget.js"></script>
 * 
 * Uso (Método 2 - data attributes):
 * <script src="https://miauchat.com.br/widget.js" data-widget-key="SUA_WIDGET_KEY"></script>
 */
(function() {
  'use strict';

  // Configuration - support both methods
  const SCRIPT_TAG = document.currentScript;
  const GLOBAL_CONFIG = window.MiauChat || {};
  
  // Get widget key from either method
  const WIDGET_KEY = GLOBAL_CONFIG.tenant || SCRIPT_TAG?.getAttribute('data-widget-key');
  const API_URL = GLOBAL_CONFIG.apiUrl || SCRIPT_TAG?.getAttribute('data-api-url') || 'https://jiragtersejnarxruqyd.supabase.co/functions/v1/ai-chat';
  const POLL_URL = GLOBAL_CONFIG.pollUrl || SCRIPT_TAG?.getAttribute('data-poll-url') || 'https://jiragtersejnarxruqyd.supabase.co/functions/v1/widget-messages';
  const POSITION = GLOBAL_CONFIG.position || SCRIPT_TAG?.getAttribute('data-position') || 'bottom-right';
  const SOURCE = GLOBAL_CONFIG.source || 'WIDGET';

  if (!WIDGET_KEY) {
    console.error('[MiauChat] Widget key is required. Set window.MiauChat.tenant or add data-widget-key attribute.');
    return;
  }

  // Prevent duplicate initialization
  if (window.MiauChatInitialized) {
    console.warn('[MiauChat] Widget already initialized');
    return;
  }
  window.MiauChatInitialized = true;

  // State
  let isOpen = false;
  let isLoading = false;
  let conversationId = null;
  let lawFirmId = null;
  let messages = [];
  let welcomeMessage = 'Olá! Como posso ajudar você hoje?';
  let offlineMessage = 'No momento não estamos disponíveis. Deixe sua mensagem que retornaremos em breve.';
  let widgetColor = '#DC2626'; // Red as default
  let lastMessageCount = 0;
  let pollingInterval = null;
  let unreadCount = 0;
  
  // Drag state
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let panelPosition = null;
  
  // Client identification state
  let clientInfo = {
    name: '',
    phone: '',
    email: ''
  };
  let isIdentified = false;

  // API Key for Supabase
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M';

  // Generate unique visitor ID
  const getVisitorId = () => {
    let visitorId = localStorage.getItem('miauchat_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('miauchat_visitor_id', visitorId);
    }
    return visitorId;
  };

  // Load client info from localStorage
  const loadClientInfo = () => {
    const saved = localStorage.getItem(`miauchat_client_${WIDGET_KEY}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.name && data.phone) {
          clientInfo = data;
          isIdentified = true;
          return true;
        }
      } catch (e) {
        console.error('[MiauChat] Failed to load client info:', e);
      }
    }
    return false;
  };

  // Save client info to localStorage
  const saveClientInfo = () => {
    localStorage.setItem(`miauchat_client_${WIDGET_KEY}`, JSON.stringify(clientInfo));
  };

  // Load conversation from localStorage
  const loadConversation = () => {
    const saved = localStorage.getItem(`miauchat_conversation_${WIDGET_KEY}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        conversationId = data.conversationId;
        messages = data.messages || [];
        lastMessageCount = messages.length;
        return true;
      } catch (e) {
        console.error('[MiauChat] Failed to load conversation:', e);
      }
    }
    return false;
  };

  // Save conversation to localStorage
  const saveConversation = () => {
    localStorage.setItem(`miauchat_conversation_${WIDGET_KEY}`, JSON.stringify({
      conversationId,
      messages,
      timestamp: Date.now()
    }));
  };

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.warn('[MiauChat] Could not play notification sound:', e);
    }
  };

  // Update unread badge
  const updateUnreadBadge = () => {
    const badge = document.getElementById('miauchat-unread-badge');
    if (badge) {
      if (unreadCount > 0 && !isOpen) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('miauchat-hidden');
        document.getElementById('miauchat-toggle')?.classList.add('miauchat-has-unread');
      } else {
        badge.classList.add('miauchat-hidden');
        document.getElementById('miauchat-toggle')?.classList.remove('miauchat-has-unread');
      }
    }
  };

  // Fetch widget configuration
  const fetchConfig = async () => {
    try {
      const response = await fetch(
        `https://jiragtersejnarxruqyd.supabase.co/rest/v1/tray_chat_integrations?widget_key=eq.${WIDGET_KEY}&is_active=eq.true&select=law_firm_id,welcome_message,offline_message,widget_color,widget_position`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY
          }
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch config');
      
      const data = await response.json();
      if (data && data.length > 0) {
        const config = data[0];
        lawFirmId = config.law_firm_id;
        if (config.welcome_message) welcomeMessage = config.welcome_message;
        if (config.offline_message) offlineMessage = config.offline_message;
        if (config.widget_color) widgetColor = config.widget_color;
        return true;
      } else {
        console.error('[MiauChat] Widget not found or inactive. Key:', WIDGET_KEY);
        return false;
      }
    } catch (error) {
      console.error('[MiauChat] Failed to fetch config:', error);
      return false;
    }
  };

  // Fetch new messages from server (polling)
  const fetchNewMessages = async () => {
    if (!conversationId || !lawFirmId) {
      return;
    }

    try {
      const lastTs = messages
        .map((m) => m.timestamp)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];

      const url = `${POLL_URL}?widgetKey=${encodeURIComponent(WIDGET_KEY)}&conversationId=${encodeURIComponent(conversationId)}${lastTs ? `&after=${encodeURIComponent(lastTs)}` : ''}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('[MiauChat] Polling failed:', response.status);
        return;
      }

      const payload = await response.json();
      const serverMessages = payload?.messages || [];
      if (!serverMessages.length) return;

      const newMessages = [];
      let hasNewFromAgent = false;
      let hasUpdatedMessages = false;
      
      serverMessages.forEach((msg) => {
        if (!msg?.id || !msg?.content) return;
        
        // Skip if we already have this message by server ID
        const alreadyByServerId = messages.find((m) => m.serverId === msg.id);
        if (alreadyByServerId) return;

        // is_from_me = true => business/attendant/system
        if (msg.is_from_me === true) {
          // Skip if we already have a local assistant message with exact same content (dedup)
          // Check for messages without serverId OR with temporary pending serverId
          const alreadyByContent = messages.find(
            (m) => m.role === 'assistant' && 
                   (!m.serverId || m.serverId.startsWith('pending_')) && 
                   m.content === msg.content
          );
          if (alreadyByContent) {
            // Update local message with real server ID instead of adding duplicate
            alreadyByContent.serverId = msg.id;
            alreadyByContent.timestamp = msg.created_at;
            hasUpdatedMessages = true;
            return;
          }
          
          newMessages.push({
            role: 'assistant',
            content: msg.content,
            serverId: msg.id,
            timestamp: msg.created_at
          });
          hasNewFromAgent = true;
          return;
        }

        // client message - skip if we already have it locally (user just sent it)
        const alreadyByUserContent = messages.find(
          (m) => m.role === 'user' && !m.serverId && m.content === msg.content
        );
        if (alreadyByUserContent) {
          // Update local message with server ID instead of adding duplicate
          alreadyByUserContent.serverId = msg.id;
          alreadyByUserContent.timestamp = msg.created_at;
          hasUpdatedMessages = true;
          return;
        }
        
        newMessages.push({
          role: 'user',
          content: msg.content,
          serverId: msg.id,
          timestamp: msg.created_at
        });
      });

      if (newMessages.length || hasUpdatedMessages) {
        if (newMessages.length) {
          messages.push(...newMessages);
        }
        messages.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
        saveConversation();
        renderMessages();
        
        // Alert for new agent messages when minimized (only for truly new messages)
        if (hasNewFromAgent && !isOpen) {
          unreadCount += newMessages.filter(m => m.role === 'assistant').length;
          updateUnreadBadge();
          playNotificationSound();
        }
      }
    } catch (error) {
      console.error('[MiauChat] Polling error:', error);
    }
  };

  // Start polling for new messages
  const startPolling = () => {
    if (pollingInterval) return;
    pollingInterval = setInterval(fetchNewMessages, 4000); // Poll every 4 seconds
    console.log('[MiauChat] Polling started');
  };

  // Stop polling
  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      console.log('[MiauChat] Polling stopped');
    }
  };

  // Format phone number for display
  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  // Create styles
  const createStyles = () => {
    const style = document.createElement('style');
    style.id = 'miauchat-styles';
    style.textContent = `
      .miauchat-widget-container * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
      
      /* Floating bubble with tooltip */
      .miauchat-widget-bubble {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
        ${POSITION.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 999999;
        cursor: pointer;
        ${POSITION.includes('right') ? 'flex-direction: row-reverse;' : 'flex-direction: row;'}
      }
      
      .miauchat-widget-bubble.miauchat-has-unread .miauchat-bubble-icon {
        animation: miauchat-pulse-alert 1.5s ease-in-out infinite;
      }
      
      @keyframes miauchat-pulse-alert {
        0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
        50% { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3); }
      }
      
      .miauchat-bubble-icon {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #111111;
        border: 3px solid #DC2626;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        flex-shrink: 0;
        position: relative;
      }
      
      .miauchat-bubble-icon:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
      }
      
      .miauchat-bubble-icon svg {
        width: 28px;
        height: 28px;
        fill: #ffffff;
      }
      
      .miauchat-unread-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 700;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      }
      
      .miauchat-bubble-tooltip {
        background: linear-gradient(135deg, #111111 0%, #1a1a1a 100%);
        color: #ffffff;
        padding: 12px 18px;
        border-radius: 24px;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        border: 2px solid #DC2626;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: miauchat-float 3s ease-in-out infinite;
      }
      
      @keyframes miauchat-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      
      .miauchat-online-dot {
        width: 10px;
        height: 10px;
        background: #DC2626;
        border-radius: 50%;
        animation: miauchat-glow 1.5s ease-in-out infinite;
      }
      
      @keyframes miauchat-glow {
        0%, 100% { box-shadow: 0 0 4px #DC2626; }
        50% { box-shadow: 0 0 10px #DC2626, 0 0 16px #DC2626; }
      }
      
      /* Panel - Modern design */
      .miauchat-widget-panel {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
        ${POSITION.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        width: 380px;
        max-width: calc(100vw - 40px);
        background: white;
        border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        max-height: calc(100vh - 120px);
      }
      
      .miauchat-widget-panel.open {
        display: flex;
        animation: miauchat-slide-in 0.3s ease;
      }
      
      .miauchat-widget-panel.dragging {
        transition: none;
        user-select: none;
      }
      
      @keyframes miauchat-slide-in {
        from {
          opacity: 0;
          transform: translateY(24px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      /* Header with drag handle */
      .miauchat-header {
        background: linear-gradient(135deg, #111111 0%, #1a1a1a 100%);
        color: #ffffff;
        padding: 16px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
        border-bottom: 3px solid #DC2626;
      }
      
      .miauchat-header-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .miauchat-header-title {
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .miauchat-header-subtitle {
        font-size: 13px;
        opacity: 0.95;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .miauchat-status-dot {
        width: 8px;
        height: 8px;
        background: #DC2626;
        border-radius: 50%;
        box-shadow: 0 0 6px #DC2626;
      }
      
      .miauchat-close-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .miauchat-close-btn:hover {
        background: rgba(255, 255, 255, 0.35);
      }
      
      .miauchat-close-btn svg {
        width: 14px;
        height: 14px;
        fill: white;
      }
      
      /* Branding bar */
      .miauchat-branding {
        background: #f8fafc;
        padding: 8px 16px;
        font-size: 11px;
        color: #64748b;
        text-align: center;
        border-bottom: 1px solid #e2e8f0;
      }
      
      .miauchat-branding a {
        color: #DC2626;
        text-decoration: none;
        font-weight: 600;
      }
      
      /* Pre-chat form styles */
      .miauchat-prechat {
        flex: 1;
        padding: 24px 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: white;
        overflow-y: auto;
      }
      
      .miauchat-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      
      .miauchat-form-label {
        font-size: 13px;
        font-weight: 600;
        color: #374151;
      }
      
      .miauchat-form-input {
        padding: 12px 14px;
        border: 2px solid #e5e7eb;
        border-radius: 10px;
        font-size: 15px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: #f9fafb;
      }
      
      .miauchat-form-input:focus {
        border-color: #DC2626;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2);
        background: white;
      }
      
      .miauchat-form-input::placeholder {
        color: #9ca3af;
      }
      
      .miauchat-form-input.error {
        border-color: #ef4444;
        background: #fef2f2;
      }
      
      .miauchat-start-btn {
        padding: 14px 24px;
        background: #DC2626;
        color: #ffffff;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s, transform 0.1s;
        margin-top: 8px;
      }
      
      .miauchat-start-btn:hover {
        opacity: 0.9;
      }
      
      .miauchat-start-btn:active {
        transform: scale(0.98);
      }
      
      .miauchat-start-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      
      /* Waiting message */
      .miauchat-waiting {
        background: #fef3c7;
        padding: 12px 16px;
        border-radius: 10px;
        text-align: center;
        font-size: 13px;
        color: #92400e;
        line-height: 1.5;
      }
      
      /* Messages area */
      .miauchat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: #f8fafc;
        min-height: 200px;
        max-height: 340px;
      }
      
      /* Date separator */
      .miauchat-date-separator {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin: 8px 0;
      }
      
      .miauchat-date-separator::before,
      .miauchat-date-separator::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #e2e8f0;
      }
      
      .miauchat-date-text {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
        white-space: nowrap;
      }
      
      /* Message wrapper for attendant messages */
      .miauchat-message-wrapper {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 85%;
      }
      
      .miauchat-message-wrapper.user {
        align-self: flex-end;
        align-items: flex-end;
      }
      
      .miauchat-message-wrapper.assistant {
        align-self: flex-start;
        align-items: flex-start;
      }
      
      /* Attendant name badge */
      .miauchat-attendant-name {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        background: #111111;
        border: 1px solid #DC2626;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        color: #ffffff;
        margin-left: 0;
      }
      
      /* Message row with avatar */
      .miauchat-message-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }
      
      .miauchat-message-row.user {
        flex-direction: row-reverse;
      }
      
      /* Attendant avatar - hidden to avoid duplication */
      .miauchat-avatar {
        display: none;
      }
      
      .miauchat-avatar svg {
        width: 16px;
        height: 16px;
        fill: #DC2626;
      }
      
      .miauchat-message {
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
        position: relative;
      }
      
      .miauchat-message.user {
        background: #111111;
        color: #ffffff;
        border-bottom-right-radius: 4px;
        border: 1px solid #DC2626;
      }
      
      .miauchat-message.assistant {
        background: white;
        color: #1f2937;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      
      .miauchat-message.system {
        align-self: center;
        background: #fef3c7;
        color: #92400e;
        font-size: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        max-width: 90%;
      }
      
      /* Timestamp */
      .miauchat-timestamp {
        font-size: 11px;
        color: #94a3b8;
        margin-left: 0;
        margin-top: 2px;
      }
      
      .miauchat-message-wrapper.user .miauchat-timestamp {
        margin-left: 0;
        margin-right: 0;
      }
      
      .miauchat-typing-wrapper {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        align-self: flex-start;
      }
      
      .miauchat-typing {
        display: flex;
        gap: 5px;
        padding: 12px 16px;
        background: white;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      
      .miauchat-typing span {
        width: 8px;
        height: 8px;
        background: #9ca3af;
        border-radius: 50%;
        animation: miauchat-bounce 1.4s ease-in-out infinite;
      }
      
      .miauchat-typing span:nth-child(1) { animation-delay: 0s; }
      .miauchat-typing span:nth-child(2) { animation-delay: 0.2s; }
      .miauchat-typing span:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes miauchat-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
      
      /* Input area */
      .miauchat-input-area {
        padding: 14px;
        background: white;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .miauchat-input {
        flex: 1;
        border: 2px solid #e5e7eb;
        border-radius: 24px;
        padding: 12px 18px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: #f9fafb;
      }
      
      .miauchat-input:focus {
        border-color: #DC2626;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
        background: white;
      }
      
      .miauchat-input::placeholder {
        color: #9ca3af;
      }
      
      .miauchat-send-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #DC2626;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s, transform 0.2s;
        flex-shrink: 0;
      }
      
      .miauchat-send-btn:hover {
        transform: scale(1.05);
      }
      
      .miauchat-send-btn:active {
        transform: scale(0.95);
      }
      
      .miauchat-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      
      .miauchat-send-btn svg {
        width: 18px;
        height: 18px;
        fill: white;
      }
      
      .miauchat-hidden {
        display: none !important;
      }
      
      /* Mobile styles */
      @media (max-width: 480px) {
        .miauchat-widget-panel {
          width: calc(100vw - 20px);
          max-height: calc(100vh - 100px);
          ${POSITION.includes('right') ? 'right: 10px;' : 'left: 10px;'}
          ${POSITION.includes('bottom') ? 'bottom: 80px;' : 'top: 80px;'}
          border-radius: 12px;
        }
        
        .miauchat-widget-bubble {
          ${POSITION.includes('right') ? 'right: 10px;' : 'left: 10px;'}
          ${POSITION.includes('bottom') ? 'bottom: 10px;' : 'top: 10px;'}
        }
        
        .miauchat-bubble-tooltip {
          display: none;
        }
        
        .miauchat-bubble-icon {
          width: 54px;
          height: 54px;
        }
      }
    `;
    document.head.appendChild(style);
  };

  // Create widget HTML
  const createWidget = () => {
    const container = document.createElement('div');
    container.className = 'miauchat-widget-container';
    container.id = 'miauchat-container';
    container.innerHTML = `
      <!-- Floating bubble with tooltip -->
      <div class="miauchat-widget-bubble" id="miauchat-toggle">
        <div class="miauchat-bubble-tooltip">
          <span class="miauchat-online-dot"></span>
          Estamos online! Fale conosco
        </div>
        <div class="miauchat-bubble-icon">
          <span class="miauchat-unread-badge miauchat-hidden" id="miauchat-unread-badge">0</span>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </div>
      </div>
      
      <!-- Chat Panel -->
      <div class="miauchat-widget-panel" id="miauchat-panel">
        <div class="miauchat-header" id="miauchat-drag-handle">
          <div class="miauchat-header-content">
            <div class="miauchat-header-title">💬 Fale Conosco</div>
            <div class="miauchat-header-subtitle">
              <span class="miauchat-status-dot"></span>
              Atendimento online
            </div>
          </div>
          <button class="miauchat-close-btn" id="miauchat-close" aria-label="Fechar chat">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div class="miauchat-branding">
          Atendimento por <a href="https://miauchat.com.br" target="_blank" rel="noopener">MiauChat</a>
        </div>
        
        <!-- Pre-chat form -->
        <div class="miauchat-prechat" id="miauchat-prechat">
          <div class="miauchat-form-group">
            <label class="miauchat-form-label">Telefone *</label>
            <input type="tel" class="miauchat-form-input" id="miauchat-phone" placeholder="(00) 00000-0000" required />
          </div>
          
          <div class="miauchat-form-group">
            <label class="miauchat-form-label">E-mail *</label>
            <input type="email" class="miauchat-form-input" id="miauchat-email" placeholder="seu@email.com" required />
          </div>
          
          <div class="miauchat-form-group">
            <label class="miauchat-form-label">Nome</label>
            <input type="text" class="miauchat-form-input" id="miauchat-name" placeholder="Seu nome (opcional)" />
          </div>
          
          <button class="miauchat-start-btn" id="miauchat-start-chat">
            Iniciar Conversa
          </button>
          
          <div class="miauchat-waiting">
            Após iniciar, um atendente responderá em breve.
          </div>
        </div>
        
        <!-- Chat area (hidden initially) -->
        <div class="miauchat-messages miauchat-hidden" id="miauchat-messages"></div>
        
        <div class="miauchat-input-area miauchat-hidden" id="miauchat-input-area">
          <input type="text" class="miauchat-input" id="miauchat-input" placeholder="Digite sua mensagem..." />
          <button class="miauchat-send-btn" id="miauchat-send" aria-label="Enviar">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    return container;
  };

  // Setup drag functionality
  const setupDrag = () => {
    const panel = document.getElementById('miauchat-panel');
    const handle = document.getElementById('miauchat-drag-handle');
    
    if (!panel || !handle) return;
    
    const onMouseDown = (e) => {
      if (e.target.closest('.miauchat-close-btn')) return;
      
      isDragging = true;
      panel.classList.add('dragging');
      
      const rect = panel.getBoundingClientRect();
      dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };
    
    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - panel.offsetWidth - 10;
      const maxY = window.innerHeight - panel.offsetHeight - 10;
      
      panelPosition = {
        x: Math.max(10, Math.min(x, maxX)),
        y: Math.max(10, Math.min(y, maxY))
      };
      
      panel.style.left = panelPosition.x + 'px';
      panel.style.top = panelPosition.y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    
    const onMouseUp = () => {
      isDragging = false;
      panel.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    // Touch support for mobile
    const onTouchStart = (e) => {
      if (e.target.closest('.miauchat-close-btn')) return;
      
      isDragging = true;
      panel.classList.add('dragging');
      
      const touch = e.touches[0];
      const rect = panel.getBoundingClientRect();
      dragOffset = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
      
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };
    
    const onTouchMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const x = touch.clientX - dragOffset.x;
      const y = touch.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - panel.offsetWidth - 10;
      const maxY = window.innerHeight - panel.offsetHeight - 10;
      
      panelPosition = {
        x: Math.max(10, Math.min(x, maxX)),
        y: Math.max(10, Math.min(y, maxY))
      };
      
      panel.style.left = panelPosition.x + 'px';
      panel.style.top = panelPosition.y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    
    const onTouchEnd = () => {
      isDragging = false;
      panel.classList.remove('dragging');
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    
    handle.addEventListener('mousedown', onMouseDown);
    handle.addEventListener('touchstart', onTouchStart);
  };

  // Show chat view (hide prechat form)
  const showChatView = () => {
    const prechat = document.getElementById('miauchat-prechat');
    const messagesArea = document.getElementById('miauchat-messages');
    const inputArea = document.getElementById('miauchat-input-area');
    
    if (prechat) prechat.classList.add('miauchat-hidden');
    if (messagesArea) messagesArea.classList.remove('miauchat-hidden');
    if (inputArea) inputArea.classList.remove('miauchat-hidden');
    
    // Start polling when chat view is shown
    startPolling();
  };

  // Show prechat form (hide chat)
  const showPrechatView = () => {
    const prechat = document.getElementById('miauchat-prechat');
    const messagesArea = document.getElementById('miauchat-messages');
    const inputArea = document.getElementById('miauchat-input-area');
    
    if (prechat) prechat.classList.remove('miauchat-hidden');
    if (messagesArea) messagesArea.classList.add('miauchat-hidden');
    if (inputArea) inputArea.classList.add('miauchat-hidden');
  };

  // Validate form
  const validateForm = () => {
    const phoneInput = document.getElementById('miauchat-phone');
    const emailInput = document.getElementById('miauchat-email');
    
    let isValid = true;
    
    phoneInput.classList.remove('error');
    emailInput.classList.remove('error');
    
    const phoneDigits = phoneInput.value.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      phoneInput.classList.add('error');
      isValid = false;
    }
    
    if (!emailInput.value.trim() || !emailInput.value.includes('@')) {
      emailInput.classList.add('error');
      isValid = false;
    }
    
    return isValid;
  };

  // Handle start chat button
  const handleStartChat = () => {
    if (!validateForm()) {
      return;
    }
    
    const nameInput = document.getElementById('miauchat-name');
    const phoneInput = document.getElementById('miauchat-phone');
    const emailInput = document.getElementById('miauchat-email');
    
    clientInfo = {
      name: nameInput.value.trim() || 'Visitante',
      phone: phoneInput.value.replace(/\D/g, ''),
      email: emailInput.value.trim()
    };
    isIdentified = true;
    saveClientInfo();
    
    showChatView();
    
    if (messages.length === 0) {
      messages.push({ role: 'assistant', content: welcomeMessage });
      renderMessages();
      saveConversation();
    }
    
    const input = document.getElementById('miauchat-input');
    if (input) input.focus();
    
    console.log('[MiauChat] Client identified:', clientInfo.name, clientInfo.phone);
  };

  // Strip attendant signature pattern from messages (_*Name*_ - Role)
  const stripSignature = (text) => {
    if (!text) return text;
    // Remove pattern: _*Name*_ - Role (at start or end of message, with optional newlines)
    return text
      .replace(/^\s*_\*[^*]+\*_\s*-\s*[^\n]+\n*/gm, '') // At line start
      .replace(/\n*_\*[^*]+\*_\s*-\s*[^\n]+\s*$/gm, '') // At line end  
      .trim();
  };

  // Extract attendant name from signature pattern
  const extractAttendantName = (text) => {
    if (!text) return null;
    const match = text.match(/_\*([^*]+)\*_/);
    return match ? match[1] : null;
  };

  // Format timestamp to display time
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  // Format date for separator
  const formatDateSeparator = (timestamp) => {
    if (!timestamp) return 'Hoje';
    try {
      const date = new Date(timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (date.toDateString() === today.toDateString()) {
        return 'Hoje';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Ontem';
      } else {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    } catch (e) {
      return 'Hoje';
    }
  };

  // Render messages
  const renderMessages = () => {
    const container = document.getElementById('miauchat-messages');
    if (!container) return;

    container.innerHTML = '';
    
    let lastDateStr = null;
    
    messages.forEach((msg, index) => {
      // Date separator logic
      const msgDate = msg.timestamp ? new Date(msg.timestamp).toDateString() : new Date().toDateString();
      if (msgDate !== lastDateStr) {
        lastDateStr = msgDate;
        const separator = document.createElement('div');
        separator.className = 'miauchat-date-separator';
        separator.innerHTML = `<span class="miauchat-date-text">${formatDateSeparator(msg.timestamp)}</span>`;
        container.appendChild(separator);
      }
      
      if (msg.role === 'system') {
        // System messages remain simple
        const div = document.createElement('div');
        div.className = 'miauchat-message system';
        div.textContent = msg.content;
        container.appendChild(div);
        return;
      }
      
      // Create message wrapper
      const wrapper = document.createElement('div');
      wrapper.className = `miauchat-message-wrapper ${msg.role}`;
      
      if (msg.role === 'assistant') {
        // Extract attendant name from message or use default
        const attendantName = extractAttendantName(msg.content) || 'Atendente';
        
        // Attendant name badge
        const nameBadge = document.createElement('div');
        nameBadge.className = 'miauchat-attendant-name';
        nameBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> ${attendantName}`;
        wrapper.appendChild(nameBadge);
        
        // Message row with avatar
        const messageRow = document.createElement('div');
        messageRow.className = 'miauchat-message-row';
        
        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'miauchat-avatar';
        avatar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        messageRow.appendChild(avatar);
        
        // Message bubble
        const bubble = document.createElement('div');
        bubble.className = 'miauchat-message assistant';
        bubble.textContent = stripSignature(msg.content);
        messageRow.appendChild(bubble);
        
        wrapper.appendChild(messageRow);
        
        // Timestamp
        const time = formatMessageTime(msg.timestamp);
        if (time) {
          const timestamp = document.createElement('div');
          timestamp.className = 'miauchat-timestamp';
          timestamp.textContent = time;
          wrapper.appendChild(timestamp);
        }
      } else {
        // User message
        const messageRow = document.createElement('div');
        messageRow.className = 'miauchat-message-row user';
        
        const bubble = document.createElement('div');
        bubble.className = 'miauchat-message user';
        bubble.textContent = msg.content;
        messageRow.appendChild(bubble);
        
        wrapper.appendChild(messageRow);
        
        // Timestamp for user
        const time = formatMessageTime(msg.timestamp);
        if (time) {
          const timestamp = document.createElement('div');
          timestamp.className = 'miauchat-timestamp';
          timestamp.textContent = time;
          wrapper.appendChild(timestamp);
        }
      }
      
      container.appendChild(wrapper);
    });

    if (isLoading) {
      const typingWrapper = document.createElement('div');
      typingWrapper.className = 'miauchat-typing-wrapper';
      
      const avatar = document.createElement('div');
      avatar.className = 'miauchat-avatar';
      avatar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
      typingWrapper.appendChild(avatar);
      
      const typing = document.createElement('div');
      typing.className = 'miauchat-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      typingWrapper.appendChild(typing);
      
      container.appendChild(typingWrapper);
    }

    container.scrollTop = container.scrollHeight;
  };

  // Send message
  const sendMessage = async (inputText) => {
    if (!inputText || !inputText.trim() || isLoading || !lawFirmId || !isIdentified) {
      console.log('[MiauChat] sendMessage blocked:', { inputText: !!inputText, isLoading, lawFirmId: !!lawFirmId, isIdentified });
      return;
    }

    const trimmedMessage = inputText.trim();
    const userMessage = { role: 'user', content: trimmedMessage };
    messages.push(userMessage);
    renderMessages();
    saveConversation();

    isLoading = true;
    renderMessages();

    try {
      const visitorId = getVisitorId();
      const pageUrl = GLOBAL_CONFIG.pageUrl || window.location.href;
      const pageTitle = document.title;
      const referrer = GLOBAL_CONFIG.referrer || document.referrer;
      const device = GLOBAL_CONFIG.device || (/Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop');

      const sessionId = conversationId || `widget_${WIDGET_KEY}_${visitorId}`;
      console.log('[MiauChat] Sending message:', { sessionId, message: trimmedMessage });

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          conversationId: sessionId,
          message: trimmedMessage,
          source: SOURCE,
          context: {
            lawFirmId,
            widgetKey: WIDGET_KEY,
            visitorId,
            clientName: clientInfo.name,
            clientPhone: clientInfo.phone,
            clientEmail: clientInfo.email,
            pageUrl,
            pageTitle,
            referrer,
            device,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });

      console.log('[MiauChat] Response status:', response.status, response.ok);

      if (!response.ok) {
        let errorDetail = '';
        try {
          errorDetail = await response.text();
        } catch (e) {}
        console.error('[MiauChat] HTTP error:', response.status, errorDetail);
        throw new Error(`Erro HTTP ${response.status}`);
      }

      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch (e) {
        console.warn('[MiauChat] Could not read response body');
      }
      
      console.log('[MiauChat] Response body:', responseBody);

      let data = null;
      if (responseBody) {
        try {
          data = JSON.parse(responseBody);
        } catch (e) {
          console.warn('[MiauChat] Could not parse JSON, but response OK');
        }
      }

      if (data && data.error) {
        console.error('[MiauChat] Backend error:', data.error);
        throw new Error(data.error);
      }

      const newConversationId = data?.conversationId || data?.conversation_id;
      if (newConversationId) {
        conversationId = newConversationId;
        console.log('[MiauChat] Conversation ID set:', conversationId);
        saveConversation();
      }

      let botResponse = null;
      if (data) {
        botResponse = data.setupMessage || data.response || data.message || data.assistantMessage || data.reply;
      }

      if (botResponse && typeof botResponse === 'object') {
        botResponse = botResponse.content || botResponse.text || botResponse.message || '';
      }

      // Only add bot response locally if we got one - mark with serverId placeholder to avoid duplication by polling
      if (typeof botResponse === 'string' && botResponse.trim()) {
        // Mark this message so polling won't add it again
        messages.push({ 
          role: 'assistant', 
          content: botResponse.trim(),
          serverId: `pending_${Date.now()}` // Temporary ID to prevent polling duplication
        });
        console.log('[MiauChat] Bot response added:', botResponse);
        saveConversation();
      }

      console.log('[MiauChat] Message sent successfully');

    } catch (error) {
      console.error('[MiauChat] Send error:', error);
      messages.push({
        role: 'system',
        content: 'Desculpe, ocorreu um erro. Tente novamente em alguns instantes.'
      });
    } finally {
      isLoading = false;
      renderMessages();
    }
  };

  // Toggle panel
  const togglePanel = () => {
    isOpen = !isOpen;
    const panel = document.getElementById('miauchat-panel');
    const bubble = document.getElementById('miauchat-toggle');
    
    if (panel) {
      panel.classList.toggle('open', isOpen);
      
      if (isOpen && !panelPosition) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
      }
      
      if (isOpen) {
        // Clear unread when opening
        unreadCount = 0;
        updateUnreadBadge();
        
        if (isIdentified) {
          showChatView();
          if (messages.length === 0) {
            messages.push({ role: 'assistant', content: welcomeMessage });
            renderMessages();
            saveConversation();
          }
        } else {
          showPrechatView();
        }
      }
      // NOTE: Keep polling active even when minimized to detect new messages
      // Polling is started in showChatView() and continues running
    }
    
    if (bubble) {
      bubble.style.display = isOpen ? 'none' : 'flex';
    }
  };

  // Initialize
  const init = async () => {
    console.log('[MiauChat] Initializing with key:', WIDGET_KEY);
    
    const configLoaded = await fetchConfig();
    if (!configLoaded) {
      console.error('[MiauChat] Failed to initialize widget - config not loaded');
      return;
    }

    console.log('[MiauChat] Config loaded, creating widget...');
    
    createStyles();
    createWidget();
    loadClientInfo();
    loadConversation();
    setupDrag();

    document.getElementById('miauchat-toggle')?.addEventListener('click', togglePanel);
    document.getElementById('miauchat-close')?.addEventListener('click', togglePanel);
    
    document.getElementById('miauchat-start-chat')?.addEventListener('click', handleStartChat);
    
    const phoneInput = document.getElementById('miauchat-phone');
    phoneInput?.addEventListener('input', (e) => {
      e.target.value = formatPhone(e.target.value);
    });
    
    const formInputs = document.querySelectorAll('#miauchat-prechat .miauchat-form-input');
    formInputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleStartChat();
        }
      });
    });
    
    const input = document.getElementById('miauchat-input');
    const sendBtn = document.getElementById('miauchat-send');
    
    sendBtn?.addEventListener('click', () => {
      if (input) {
        sendMessage(input.value);
        input.value = '';
      }
    });
    
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
        input.value = '';
      }
    });

    if (!localStorage.getItem(`miauchat_first_use_${WIDGET_KEY}`)) {
      localStorage.setItem(`miauchat_first_use_${WIDGET_KEY}`, Date.now().toString());
    }

    console.log('[MiauChat] Widget initialized successfully');
  };

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();