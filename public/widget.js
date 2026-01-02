/**
 * MiauChat Tray Widget
 * Widget de chat embarcável para sites Tray
 * 
 * Uso:
 * <script src="https://seu-dominio.com/widget.js" data-widget-key="SUA_WIDGET_KEY"></script>
 */
(function() {
  'use strict';

  // Configuration
  const SCRIPT_TAG = document.currentScript;
  const WIDGET_KEY = SCRIPT_TAG?.getAttribute('data-widget-key');
  const API_URL = SCRIPT_TAG?.getAttribute('data-api-url') || 'https://jiragtersejnarxruqyd.supabase.co/functions/v1/ai-chat';
  const POSITION = SCRIPT_TAG?.getAttribute('data-position') || 'bottom-right';
  const PRIMARY_COLOR = SCRIPT_TAG?.getAttribute('data-color') || '#8B5CF6';

  if (!WIDGET_KEY) {
    console.error('[MiauChat] Widget key is required. Add data-widget-key attribute to script tag.');
    return;
  }

  // State
  let isOpen = false;
  let isLoading = false;
  let conversationId = null;
  let lawFirmId = null;
  let messages = [];
  let welcomeMessage = 'Olá! Como posso ajudar você hoje?';
  let offlineMessage = 'No momento não estamos disponíveis. Deixe sua mensagem que retornaremos em breve.';

  // Generate unique visitor ID
  const getVisitorId = () => {
    let visitorId = localStorage.getItem('miauchat_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('miauchat_visitor_id', visitorId);
    }
    return visitorId;
  };

  // Load conversation from localStorage
  const loadConversation = () => {
    const saved = localStorage.getItem(`miauchat_conversation_${WIDGET_KEY}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        conversationId = data.conversationId;
        messages = data.messages || [];
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
      const response = await fetch(`https://jiragtersejnarxruqyd.supabase.co/rest/v1/tray_chat_integrations?widget_key=eq.${WIDGET_KEY}&is_active=eq.true&select=law_firm_id,welcome_message,offline_message,widget_color,widget_position`, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch config');
      
      const data = await response.json();
      if (data && data.length > 0) {
        const config = data[0];
        lawFirmId = config.law_firm_id;
        if (config.welcome_message) welcomeMessage = config.welcome_message;
        if (config.offline_message) offlineMessage = config.offline_message;
        return true;
      } else {
        console.error('[MiauChat] Widget not found or inactive');
        return false;
      }
    } catch (error) {
      console.error('[MiauChat] Failed to fetch config:', error);
      return false;
    }
  };

  // Create styles
  const createStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
      .miauchat-widget-container * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
      
      .miauchat-widget-button {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
        ${POSITION.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${PRIMARY_COLOR};
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        z-index: 999999;
      }
      
      .miauchat-widget-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }
      
      .miauchat-widget-button svg {
        width: 28px;
        height: 28px;
        fill: white;
      }
      
      .miauchat-widget-panel {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
        ${POSITION.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
      }
      
      .miauchat-widget-panel.open {
        display: flex;
        animation: miauchat-slide-in 0.3s ease;
      }
      
      @keyframes miauchat-slide-in {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .miauchat-header {
        background: ${PRIMARY_COLOR};
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .miauchat-header-title {
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .miauchat-header-title svg {
        width: 24px;
        height: 24px;
        fill: white;
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
        background: rgba(255, 255, 255, 0.3);
      }
      
      .miauchat-close-btn svg {
        width: 16px;
        height: 16px;
        fill: white;
      }
      
      .miauchat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f8f9fa;
      }
      
      .miauchat-message {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }
      
      .miauchat-message.user {
        align-self: flex-end;
        background: ${PRIMARY_COLOR};
        color: white;
        border-bottom-right-radius: 4px;
      }
      
      .miauchat-message.assistant {
        align-self: flex-start;
        background: white;
        color: #1f2937;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .miauchat-message.system {
        align-self: center;
        background: #e5e7eb;
        color: #6b7280;
        font-size: 13px;
        padding: 8px 12px;
      }
      
      .miauchat-typing {
        display: flex;
        gap: 4px;
        padding: 12px 16px;
        background: white;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        align-self: flex-start;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
      
      .miauchat-input-area {
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
      }
      
      .miauchat-input {
        flex: 1;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .miauchat-input:focus {
        border-color: ${PRIMARY_COLOR};
      }
      
      .miauchat-input::placeholder {
        color: #9ca3af;
      }
      
      .miauchat-send-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: ${PRIMARY_COLOR};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s;
      }
      
      .miauchat-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .miauchat-send-btn svg {
        width: 18px;
        height: 18px;
        fill: white;
      }
      
      .miauchat-powered {
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: #9ca3af;
        background: #f8f9fa;
      }
      
      .miauchat-powered a {
        color: ${PRIMARY_COLOR};
        text-decoration: none;
      }
      
      @media (max-width: 480px) {
        .miauchat-widget-panel {
          width: calc(100vw - 20px);
          height: calc(100vh - 100px);
          ${POSITION.includes('right') ? 'right: 10px;' : 'left: 10px;'}
          ${POSITION.includes('bottom') ? 'bottom: 80px;' : 'top: 80px;'}
          border-radius: 12px;
        }
        
        .miauchat-widget-button {
          ${POSITION.includes('right') ? 'right: 10px;' : 'left: 10px;'}
          ${POSITION.includes('bottom') ? 'bottom: 10px;' : 'top: 10px;'}
        }
      }
    `;
    document.head.appendChild(style);
  };

  // Create widget HTML
  const createWidget = () => {
    const container = document.createElement('div');
    container.className = 'miauchat-widget-container';
    container.innerHTML = `
      <button class="miauchat-widget-button" id="miauchat-toggle" aria-label="Abrir chat">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
      </button>
      
      <div class="miauchat-widget-panel" id="miauchat-panel">
        <div class="miauchat-header">
          <div class="miauchat-header-title">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Chat
          </div>
          <button class="miauchat-close-btn" id="miauchat-close" aria-label="Fechar chat">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div class="miauchat-messages" id="miauchat-messages"></div>
        
        <div class="miauchat-input-area">
          <input type="text" class="miauchat-input" id="miauchat-input" placeholder="Digite sua mensagem..." />
          <button class="miauchat-send-btn" id="miauchat-send" aria-label="Enviar">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        
        <div class="miauchat-powered">
          Powered by <a href="https://miauchat.com.br" target="_blank" rel="noopener">MiauChat</a>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    return container;
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
  const sendMessage = async (text) => {
    if (!text.trim() || isLoading || !lawFirmId) return;

    const userMessage = { role: 'user', content: text.trim() };
    messages.push(userMessage);
    renderMessages();
    saveConversation();

    isLoading = true;
    renderMessages();

    try {
      const visitorId = getVisitorId();
      const pageUrl = window.location.href;
      const pageTitle = document.title;

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M'
        },
        body: JSON.stringify({
          conversationId: conversationId || `tray_${WIDGET_KEY}_${visitorId}`,
          message: text.trim(),
          source: 'TRAY',
          context: {
            lawFirmId,
            widgetKey: WIDGET_KEY,
            visitorId,
            pageUrl,
            pageTitle,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        conversationId = data.conversationId;
        const assistantMessage = { role: 'assistant', content: data.response };
        messages.push(assistantMessage);
        saveConversation();
      } else {
        throw new Error(data.error || 'Erro ao processar mensagem');
      }
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
    if (panel) {
      panel.classList.toggle('open', isOpen);
      if (isOpen && messages.length === 0) {
        // Add welcome message
        messages.push({ role: 'assistant', content: welcomeMessage });
        renderMessages();
        saveConversation();
      }
    }
  };

  // Initialize
  const init = async () => {
    const configLoaded = await fetchConfig();
    if (!configLoaded) {
      console.error('[MiauChat] Failed to initialize widget');
      return;
    }

    createStyles();
    createWidget();
    loadConversation();

    // Event listeners
    document.getElementById('miauchat-toggle')?.addEventListener('click', togglePanel);
    document.getElementById('miauchat-close')?.addEventListener('click', togglePanel);
    
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
      // Could send analytics here
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
