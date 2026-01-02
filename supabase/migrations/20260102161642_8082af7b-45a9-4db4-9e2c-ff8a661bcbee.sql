-- ========================================
-- Google Calendar Integration Tables
-- ========================================

-- Tabela para armazenar tokens OAuth do Google Calendar por tenant
CREATE TABLE public.google_calendar_integrations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    
    -- OAuth tokens (encrypted)
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Account info
    google_email TEXT NOT NULL,
    google_account_id TEXT,
    
    -- Selected calendar
    default_calendar_id TEXT,
    default_calendar_name TEXT,
    
    -- Permissions
    allow_read_events BOOLEAN NOT NULL DEFAULT true,
    allow_create_events BOOLEAN NOT NULL DEFAULT true,
    allow_edit_events BOOLEAN NOT NULL DEFAULT true,
    allow_delete_events BOOLEAN NOT NULL DEFAULT false,
    
    -- Sync info
    last_sync_at TIMESTAMP WITH TIME ZONE,
    next_sync_at TIMESTAMP WITH TIME ZONE,
    sync_token TEXT,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    connected_by UUID REFERENCES auth.users(id),
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    UNIQUE(law_firm_id)
);

-- Tabela para logs de ações da IA no calendário
CREATE TABLE public.google_calendar_ai_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES public.google_calendar_integrations(id) ON DELETE CASCADE,
    
    -- Action details
    action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'query'
    event_id TEXT, -- Google Event ID
    event_title TEXT,
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    
    -- AI context
    ai_agent_id UUID REFERENCES public.automations(id),
    conversation_id UUID REFERENCES public.conversations(id),
    client_id UUID REFERENCES public.clients(id),
    
    -- Request/response
    request_description TEXT, -- Human-readable description of what was requested
    response_summary TEXT, -- What the AI did
    
    -- Status
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    
    -- Metadata
    performed_by TEXT NOT NULL DEFAULT 'ai', -- 'ai', 'user', 'system'
    ip_address TEXT,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para eventos sincronizados
CREATE TABLE public.google_calendar_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES public.google_calendar_integrations(id) ON DELETE CASCADE,
    
    -- Google Event data
    google_event_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    
    -- Event details
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    is_all_day BOOLEAN DEFAULT false,
    
    -- Status
    status TEXT DEFAULT 'confirmed', -- 'confirmed', 'tentative', 'cancelled'
    
    -- Attendees (JSON array)
    attendees JSONB DEFAULT '[]'::jsonb,
    
    -- Recurrence
    recurrence_rule TEXT,
    recurring_event_id TEXT,
    
    -- Links
    html_link TEXT,
    meet_link TEXT,
    
    -- Associations
    client_id UUID REFERENCES public.clients(id),
    conversation_id UUID REFERENCES public.conversations(id),
    
    -- Metadata
    created_by_ai BOOLEAN DEFAULT false,
    
    -- Sync metadata
    etag TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    UNIQUE(law_firm_id, google_event_id)
);

-- Índices para performance
CREATE INDEX idx_gcal_integrations_law_firm ON public.google_calendar_integrations(law_firm_id);
CREATE INDEX idx_gcal_integrations_active ON public.google_calendar_integrations(is_active) WHERE is_active = true;

CREATE INDEX idx_gcal_ai_logs_law_firm ON public.google_calendar_ai_logs(law_firm_id);
CREATE INDEX idx_gcal_ai_logs_integration ON public.google_calendar_ai_logs(integration_id);
CREATE INDEX idx_gcal_ai_logs_created ON public.google_calendar_ai_logs(created_at DESC);

CREATE INDEX idx_gcal_events_law_firm ON public.google_calendar_events(law_firm_id);
CREATE INDEX idx_gcal_events_integration ON public.google_calendar_events(integration_id);
CREATE INDEX idx_gcal_events_google_id ON public.google_calendar_events(google_event_id);
CREATE INDEX idx_gcal_events_start ON public.google_calendar_events(start_time);

-- Enable RLS
ALTER TABLE public.google_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for google_calendar_integrations
CREATE POLICY "Users can view their law firm integration"
    ON public.google_calendar_integrations FOR SELECT
    USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage their law firm integration"
    ON public.google_calendar_integrations FOR ALL
    USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for google_calendar_ai_logs
CREATE POLICY "Users can view their law firm logs"
    ON public.google_calendar_ai_logs FOR SELECT
    USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "System can insert logs"
    ON public.google_calendar_ai_logs FOR INSERT
    WITH CHECK (true);

-- RLS Policies for google_calendar_events
CREATE POLICY "Users can view their law firm events"
    ON public.google_calendar_events FOR SELECT
    USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can manage their law firm events"
    ON public.google_calendar_events FOR ALL
    USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_google_calendar_integrations_updated_at
    BEFORE UPDATE ON public.google_calendar_integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_calendar_events_updated_at
    BEFORE UPDATE ON public.google_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();