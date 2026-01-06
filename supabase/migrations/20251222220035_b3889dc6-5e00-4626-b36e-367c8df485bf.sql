-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'advogado', 'estagiario', 'atendente');

-- Create enum for case status
CREATE TYPE public.case_status AS ENUM ('novo_contato', 'triagem_ia', 'aguardando_documentos', 'em_analise', 'em_andamento', 'encerrado');

-- Create enum for message handler
CREATE TYPE public.message_handler AS ENUM ('ai', 'human');

-- Create enum for legal area
CREATE TYPE public.legal_area AS ENUM ('civil', 'trabalhista', 'penal', 'familia', 'consumidor', 'empresarial', 'tributario', 'ambiental', 'outros');

-- Create law_firms table
CREATE TABLE public.law_firms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    document TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
    id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    oab_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'atendente',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, role)
);

-- Create clients table
CREATE TABLE public.clients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    document TEXT,
    address TEXT,
    notes TEXT,
    lgpd_consent BOOLEAN NOT NULL DEFAULT false,
    lgpd_consent_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create whatsapp_instances table
CREATE TABLE public.whatsapp_instances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    instance_id TEXT,
    api_url TEXT NOT NULL,
    api_key TEXT,
    phone_number TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create conversations table
CREATE TABLE public.conversations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    remote_jid TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    current_handler message_handler NOT NULL DEFAULT 'ai',
    status case_status NOT NULL DEFAULT 'novo_contato',
    priority INTEGER NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    internal_notes TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create messages table
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL, -- 'client', 'user', 'ai'
    sender_id UUID,
    content TEXT,
    message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'audio', 'image', 'document'
    media_url TEXT,
    media_mime_type TEXT,
    is_from_me BOOLEAN NOT NULL DEFAULT false,
    whatsapp_message_id TEXT,
    ai_generated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cases table (legal cases linked to conversations)
CREATE TABLE public.cases (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    legal_area legal_area NOT NULL DEFAULT 'outros',
    status case_status NOT NULL DEFAULT 'novo_contato',
    priority INTEGER NOT NULL DEFAULT 0,
    case_number TEXT,
    ai_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create kanban_columns table
CREATE TABLE public.kanban_columns (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status case_status NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create automations table
CREATE TABLE public.automations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    webhook_url TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'new_conversation', 'keyword', 'scheduled'
    trigger_config JSONB DEFAULT '{}',
    ai_prompt TEXT,
    ai_temperature DECIMAL(2,1) DEFAULT 0.7,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create consent_logs table (LGPD compliance)
CREATE TABLE public.consent_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL, -- 'data_collection', 'communication', 'data_sharing'
    granted BOOLEAN NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create webhook_logs table
CREATE TABLE public.webhook_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
    direction TEXT NOT NULL, -- 'incoming', 'outgoing'
    payload JSONB NOT NULL,
    response JSONB,
    status_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create documents table
CREATE TABLE public.documents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.law_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Create function to get user's law_firm_id
CREATE OR REPLACE FUNCTION public.get_user_law_firm_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT law_firm_id
    FROM public.profiles
    WHERE id = _user_id
$$;

-- Create function to check if user belongs to law firm
CREATE OR REPLACE FUNCTION public.user_belongs_to_law_firm(_user_id UUID, _law_firm_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = _user_id
          AND law_firm_id = _law_firm_id
    )
$$;

-- RLS Policies for law_firms
CREATE POLICY "Users can view their law firm"
ON public.law_firms FOR SELECT
TO authenticated
USING (id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can update their law firm"
ON public.law_firms FOR UPDATE
TO authenticated
USING (id = public.get_user_law_firm_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their law firm"
ON public.profiles FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their law firm"
ON public.user_roles FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id
        AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Admins can manage roles in their law firm"
ON public.user_roles FOR ALL
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id
        AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

-- RLS Policies for clients
CREATE POLICY "Users can view clients in their law firm"
ON public.clients FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can manage clients in their law firm"
ON public.clients FOR ALL
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- RLS Policies for whatsapp_instances
CREATE POLICY "Users can view instances in their law firm"
ON public.whatsapp_instances FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage instances"
ON public.whatsapp_instances FOR ALL
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations in their law firm"
ON public.conversations FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can manage conversations in their law firm"
ON public.conversations FOR ALL
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
        AND c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can manage messages in their conversations"
ON public.messages FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
        AND c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

-- RLS Policies for cases
CREATE POLICY "Users can view cases in their law firm"
ON public.cases FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can manage cases in their law firm"
ON public.cases FOR ALL
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- RLS Policies for kanban_columns
CREATE POLICY "Users can view kanban columns in their law firm"
ON public.kanban_columns FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage kanban columns"
ON public.kanban_columns FOR ALL
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- RLS Policies for automations
CREATE POLICY "Users can view automations in their law firm"
ON public.automations FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage automations"
ON public.automations FOR ALL
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- RLS Policies for consent_logs
CREATE POLICY "Users can view consent logs for their clients"
ON public.consent_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = consent_logs.client_id
        AND c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can manage consent logs"
ON public.consent_logs FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = consent_logs.client_id
        AND c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

-- RLS Policies for webhook_logs
CREATE POLICY "Admins can view webhook logs"
ON public.webhook_logs FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin')
    AND (
        automation_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.automations a
            WHERE a.id = webhook_logs.automation_id
            AND a.law_firm_id = public.get_user_law_firm_id(auth.uid())
        )
    )
);

-- RLS Policies for documents
CREATE POLICY "Users can view documents in their law firm"
ON public.documents FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = documents.client_id
        AND c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
    OR EXISTS (
        SELECT 1 FROM public.cases cs
        WHERE cs.id = documents.case_id
        AND cs.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can manage documents in their law firm"
ON public.documents FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = documents.client_id
        AND c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
    OR EXISTS (
        SELECT 1 FROM public.cases cs
        WHERE cs.id = documents.case_id
        AND cs.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
);

-- Create trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create trigger to auto-assign default role
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user already has a role
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, 'atendente');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_law_firms_updated_at BEFORE UPDATE ON public.law_firms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages and conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;