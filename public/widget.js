/**
 * MiauChat Widget v2.0
 * Widget de chat embarcável para sites externos
 * - Design estilo JivoChat
 * - Widget arrastável
 * - Polling para receber mensagens do atendente
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
  const POSITION = GLOBAL_CONFIG.position || SCRIPT_TAG?.getAttribute('data-position') || 'bottom-right';
  const PRIMARY_COLOR = GLOBAL_CONFIG.color || SCRIPT_TAG?.getAttribute('data-color') || '#4CAF50';
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
  let widgetColor = PRIMARY_COLOR;
  let lastMessageCount = 0;
  let pollingInterval = null;
  
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
      console.log('[MiauChat] Polling skipped - no conversationId or lawFirmId');
      return;
    }
    
    try {
      // Query messages from the conversation
      const url = `https://jiragtersejnarxruqyd.supabase.co/rest/v1/messages?conversation_id=eq.${conversationId}&order=created_at.asc&select=id,content,sender_type,is_from_me,created_at,message_type`;
      
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY
        }
      });
      
      if (!response.ok) {
        console.warn('[MiauChat] Polling failed:', response.status);
        return;
      }
      
      const serverMessages = await response.json();
      if (!serverMessages || serverMessages.length === 0) return;
      
      console.log('[MiauChat] Polling fetched', serverMessages.length, 'messages');
      
      // Check for new messages from attendant/system (is_from_me = true means from business/attendant/bot)
      const newMessages = [];
      serverMessages.forEach(msg => {
        // Skip if no content
        if (!msg.content) return;
        
        // Check if we already have this message by serverId
        const existingMsg = messages.find(m => m.serverId === msg.id);
        if (existingMsg) return;
        
        // Messages FROM the business (attendant/bot/system) have is_from_me = true
        // Messages FROM the client have is_from_me = false OR sender_type = 'client'
        if (msg.is_from_me === true) {
          // This is a message from attendant/bot/system
          newMessages.push({
            role: 'assistant',
            content: msg.content,
            serverId: msg.id,
            timestamp: msg.created_at
          });
        } else if (msg.sender_type === 'client' || msg.is_from_me === false) {
          // This is a user message - check if we have it
          const existingUserMsg = messages.find(m => 
            m.role === 'user' && m.content === msg.content
          );
          if (!existingUserMsg) {
            // We don't have this user message locally (maybe from another session)
            newMessages.push({
              role: 'user',
              content: msg.content,
              serverId: msg.id,
              timestamp: msg.created_at
            });
          }
        }
      });
      
      if (newMessages.length > 0) {
        // Add new messages to our list
        messages.push(...newMessages);
        // Sort by timestamp
        messages.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
        saveConversation();
        renderMessages();
        console.log('[MiauChat] Added', newMessages.length, 'new messages from polling');
      }
    } catch (error) {
      console.error('[MiauChat] Polling error:', error);
    }
  };

  // Start polling for new messages
  const startPolling = () => {
    if (pollingInterval) return;
    pollingInterval = setInterval(fetchNewMessages, 5000); // Poll every 5 seconds
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
        gap: 8px;
        z-index: 999999;
        cursor: pointer;
        ${POSITION.includes('right') ? 'flex-direction: row-reverse;' : 'flex-direction: row;'}
      }
      
      .miauchat-bubble-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: ${widgetColor};
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        flex-shrink: 0;
      }
      
      .miauchat-bubble-icon:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
      }
      
      .miauchat-bubble-icon svg {
        width: 26px;
        height: 26px;
        fill: white;
      }
      
      .miauchat-bubble-tooltip {
        background: linear-gradient(135deg, #2c3e50 0%, #1a252f 100%);
        color: white;
        padding: 10px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: miauchat-pulse 2s ease-in-out infinite;
      }
      
      .miauchat-bubble-tooltip::after {
        content: '';
        position: absolute;
        ${POSITION.includes('right') ? 'right: -6px;' : 'left: -6px;'}
        top: 50%;
        transform: translateY(-50%);
        border: 6px solid transparent;
        ${POSITION.includes('right') ? 'border-left-color: #2c3e50;' : 'border-right-color: #2c3e50;'}
      }
      
      .miauchat-online-dot {
        width: 8px;
        height: 8px;
        background: #4CAF50;
        border-radius: 50%;
        animation: miauchat-glow 1.5s ease-in-out infinite;
      }
      
      @keyframes miauchat-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }
      
      @keyframes miauchat-glow {
        0%, 100% { box-shadow: 0 0 4px #4CAF50; }
        50% { box-shadow: 0 0 8px #4CAF50, 0 0 12px #4CAF50; }
      }
      
      /* Panel - JivoChat style */
      .miauchat-widget-panel {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
        ${POSITION.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        width: 370px;
        max-width: calc(100vw - 40px);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
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
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      /* Header with drag handle */
      .miauchat-header {
        background: ${widgetColor};
        color: white;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
      }
      
      .miauchat-header-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      
      .miauchat-header-title {
        font-size: 15px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .miauchat-header-subtitle {
        font-size: 12px;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .miauchat-status-dot {
        width: 8px;
        height: 8px;
        background: #90EE90;
        border-radius: 50%;
      }
      
      .miauchat-close-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .miauchat-close-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      
      .miauchat-close-btn svg {
        width: 14px;
        height: 14px;
        fill: white;
      }
      
      /* Branding bar */
      .miauchat-branding {
        background: #f5f5f5;
        padding: 8px 16px;
        font-size: 11px;
        color: #888;
        text-align: center;
        border-bottom: 1px solid #eee;
      }
      
      .miauchat-branding a {
        color: ${widgetColor};
        text-decoration: none;
        font-weight: 500;
      }
      
      /* Pre-chat form styles */
      .miauchat-prechat {
        flex: 1;
        padding: 20px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: white;
        overflow-y: auto;
      }
      
      .miauchat-form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .miauchat-form-label {
        font-size: 12px;
        font-weight: 500;
        color: #666;
      }
      
      .miauchat-form-input {
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      
      .miauchat-form-input:focus {
        border-color: ${widgetColor};
        box-shadow: 0 0 0 2px ${widgetColor}20;
      }
      
      .miauchat-form-input::placeholder {
        color: #aaa;
      }
      
      .miauchat-form-input.error {
        border-color: #ef4444;
      }
      
      .miauchat-start-btn {
        padding: 12px 20px;
        background: ${widgetColor};
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
        margin-top: 8px;
      }
      
      .miauchat-start-btn:hover {
        opacity: 0.9;
      }
      
      .miauchat-start-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      /* Waiting message */
      .miauchat-waiting {
        background: #f9f9f9;
        padding: 16px;
        text-align: center;
        font-size: 13px;
        color: #666;
        line-height: 1.5;
      }
      
      /* Messages area */
      .miauchat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: #f9f9f9;
        min-height: 200px;
        max-height: 320px;
      }
      
      .miauchat-message {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
      }
      
      .miauchat-message.user {
        align-self: flex-end;
        background: ${widgetColor};
        color: white;
        border-bottom-right-radius: 4px;
      }
      
      .miauchat-message.assistant {
        align-self: flex-start;
        background: white;
        color: #333;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      }
      
      .miauchat-message.system {
        align-self: center;
        background: #fff3cd;
        color: #856404;
        font-size: 12px;
        padding: 8px 12px;
      }
      
      .miauchat-typing {
        display: flex;
        gap: 4px;
        padding: 10px 14px;
        background: white;
        border-radius: 12px;
        border-bottom-left-radius: 4px;
        align-self: flex-start;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      }
      
      .miauchat-typing span {
        width: 6px;
        height: 6px;
        background: #aaa;
        border-radius: 50%;
        animation: miauchat-bounce 1.4s ease-in-out infinite;
      }
      
      .miauchat-typing span:nth-child(1) { animation-delay: 0s; }
      .miauchat-typing span:nth-child(2) { animation-delay: 0.2s; }
      .miauchat-typing span:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes miauchat-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-3px); }
      }
      
      /* Input area */
      .miauchat-input-area {
        padding: 12px;
        background: white;
        border-top: 1px solid #eee;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      .miauchat-input {
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 20px;
        padding: 10px 14px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .miauchat-input:focus {
        border-color: ${widgetColor};
      }
      
      .miauchat-input::placeholder {
        color: #aaa;
      }
      
      .miauchat-send-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: ${widgetColor};
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
      
      .miauchat-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      
      .miauchat-send-btn svg {
        width: 16px;
        height: 16px;
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
        }
        
        .miauchat-widget-bubble {
          ${POSITION.includes('right') ? 'right: 10px;' : 'left: 10px;'}
          ${POSITION.includes('bottom') ? 'bottom: 10px;' : 'top: 10px;'}
        }
        
        .miauchat-bubble-tooltip {
          display: none;
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
          Fale conosco, estamos online!
        </div>
        <div class="miauchat-bubble-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </div>
      </div>
      
      <!-- Chat Panel -->
      <div class="miauchat-widget-panel" id="miauchat-panel">
        <div class="miauchat-header" id="miauchat-drag-handle">
          <div class="miauchat-header-content">
            <div class="miauchat-header-title">Digite a sua mensagem!</div>
            <div class="miauchat-header-subtitle">
              <span class="miauchat-status-dot"></span>
              Os operadores estão online!
            </div>
          </div>
          <button class="miauchat-close-btn" id="miauchat-close" aria-label="Fechar chat">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div class="miauchat-branding">
          Chat desenvolvido por <a href="https://miauchat.com.br" target="_blank" rel="noopener">MiauChat</a>
        </div>
        
        <!-- Pre-chat form -->
        <div class="miauchat-prechat" id="miauchat-prechat">
          <div class="miauchat-form-group">
            <label class="miauchat-form-label">Telefone</label>
            <input type="tel" class="miauchat-form-input" id="miauchat-phone" placeholder="+55 (00) 00000-0000" required />
          </div>
          
          <div class="miauchat-form-group">
            <label class="miauchat-form-label">E-mail*</label>
            <input type="email" class="miauchat-form-input" id="miauchat-email" placeholder="seu@email.com" required />
          </div>
          
          <div class="miauchat-form-group">
            <label class="miauchat-form-label">Nome</label>
            <input type="text" class="miauchat-form-input" id="miauchat-name" placeholder="Seu nome" />
          </div>
          
          <button class="miauchat-start-btn" id="miauchat-start-chat">
            Enviar
          </button>
          
          <div class="miauchat-waiting">
            Por favor, aguarde. Todos os operadores estão ocupados no momento, mas logo alguém estará disponível para te atender.
          </div>
        </div>
        
        <!-- Chat area (hidden initially) -->
        <div class="miauchat-messages miauchat-hidden" id="miauchat-messages"></div>
        
        <div class="miauchat-input-area miauchat-hidden" id="miauchat-input-area">
          <input type="text" class="miauchat-input" id="miauchat-input" placeholder="Digite aqui" />
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
      // Ignore if clicking close button
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
      
      // Constrain to viewport
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
    
    // Clear previous errors
    phoneInput.classList.remove('error');
    emailInput.classList.remove('error');
    
    // Validate phone (required, min 10 digits)
    const phoneDigits = phoneInput.value.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      phoneInput.classList.add('error');
      isValid = false;
    }
    
    // Validate email (required)
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
    
    // Save client info
    clientInfo = {
      name: nameInput.value.trim() || 'Visitante',
      phone: phoneInput.value.replace(/\D/g, ''),
      email: emailInput.value.trim()
    };
    isIdentified = true;
    saveClientInfo();
    
    // Switch to chat view
    showChatView();
    
    // Add welcome message
    if (messages.length === 0) {
      messages.push({ role: 'assistant', content: welcomeMessage });
      renderMessages();
      saveConversation();
    }
    
    // Focus input
    const input = document.getElementById('miauchat-input');
    if (input) input.focus();
    
    console.log('[MiauChat] Client identified:', clientInfo.name, clientInfo.phone);
  };

  // Render messages
  const renderMessages = () => {
    const container = document.getElementById('miauchat-messages');
    if (!container) return;

    container.innerHTML = '';
    
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = `miauchat-message ${msg.role}`;
      div.textContent = msg.content;
      container.appendChild(div);
    });

    if (isLoading) {
      const typing = document.createElement('div');
      typing.className = 'miauchat-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(typing);
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

      // Only show error for actual HTTP errors (4xx/5xx)
      if (!response.ok) {
        let errorDetail = '';
        try {
          errorDetail = await response.text();
        } catch (e) {}
        console.error('[MiauChat] HTTP error:', response.status, errorDetail);
        throw new Error(`Erro HTTP ${response.status}`);
      }

      // Read body as text first
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch (e) {
        console.warn('[MiauChat] Could not read response body');
      }
      
      console.log('[MiauChat] Response body:', responseBody);

      // Parse JSON if possible
      let data = null;
      if (responseBody) {
        try {
          data = JSON.parse(responseBody);
        } catch (e) {
          console.warn('[MiauChat] Could not parse JSON, but response OK');
        }
      }

      // Check for explicit error in JSON response
      if (data && data.error) {
        console.error('[MiauChat] Backend error:', data.error);
        throw new Error(data.error);
      }

      // Save conversationId if returned
      const newConversationId = data?.conversationId || data?.conversation_id;
      if (newConversationId) {
        conversationId = newConversationId;
        console.log('[MiauChat] Conversation ID set:', conversationId);
        saveConversation();
      }

      // Check for bot response in various fields
      let botResponse = null;
      if (data) {
        botResponse = data.setupMessage || data.response || data.message || data.assistantMessage || data.reply;
      }

      if (botResponse && typeof botResponse === 'object') {
        botResponse = botResponse.content || botResponse.text || botResponse.message || '';
      }

      if (typeof botResponse === 'string' && botResponse.trim()) {
        messages.push({ role: 'assistant', content: botResponse.trim() });
        console.log('[MiauChat] Bot response added:', botResponse);
        saveConversation();
      }

      // Success - message was sent
      console.log('[MiauChat] Message sent successfully');

    } catch (error) {
      console.error('[MiauChat] Send error:', error);
      messages.push({
        role: 'system',
        content: 'Desculpe, ocorreu um erro. Tente novamente.'
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
      
      // Reset position when opening
      if (isOpen && !panelPosition) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
      }
      
      if (isOpen) {
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
      } else {
        stopPolling();
      }
    }
    
    // Hide/show bubble
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

    // Event listeners
    document.getElementById('miauchat-toggle')?.addEventListener('click', togglePanel);
    document.getElementById('miauchat-close')?.addEventListener('click', togglePanel);
    
    // Start chat button
    document.getElementById('miauchat-start-chat')?.addEventListener('click', handleStartChat);
    
    // Phone input formatting
    const phoneInput = document.getElementById('miauchat-phone');
    phoneInput?.addEventListener('input', (e) => {
      e.target.value = formatPhone(e.target.value);
    });
    
    // Allow Enter to submit form
    const formInputs = document.querySelectorAll('#miauchat-prechat .miauchat-form-input');
    formInputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleStartChat();
        }
      });
    });
    
    // Chat input and send button
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

    // Track first use
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
