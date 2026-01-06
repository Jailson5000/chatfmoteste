-- =============================================
-- TRAY COMMERCE INTEGRATION - MULTI-TENANT
-- =============================================

-- 1. Tabela principal de conexões por loja
CREATE TABLE public.tray_commerce_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    store_url TEXT NOT NULL,
    tray_store_id TEXT,
    api_address TEXT,
    consumer_key TEXT,
    consumer_secret TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sync_products BOOLEAN NOT NULL DEFAULT true,
    sync_orders BOOLEAN NOT NULL DEFAULT true,
    sync_customers BOOLEAN NOT NULL DEFAULT true,
    sync_coupons BOOLEAN NOT NULL DEFAULT true,
    sync_shipping BOOLEAN NOT NULL DEFAULT true,
    read_only_mode BOOLEAN NOT NULL DEFAULT false,
    connection_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('disconnected', 'connected', 'error', 'token_expired')),
    last_error TEXT,
    connected_at TIMESTAMP WITH TIME ZONE,
    connected_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Estado de sincronização por conexão
CREATE TABLE public.tray_commerce_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE,
    last_products_sync_at TIMESTAMP WITH TIME ZONE,
    last_orders_sync_at TIMESTAMP WITH TIME ZONE,
    last_customers_sync_at TIMESTAMP WITH TIME ZONE,
    last_coupons_sync_at TIMESTAMP WITH TIME ZONE,
    last_shipping_sync_at TIMESTAMP WITH TIME ZONE,
    last_webhook_at TIMESTAMP WITH TIME ZONE,
    products_synced_count INTEGER DEFAULT 0,
    orders_synced_count INTEGER DEFAULT 0,
    customers_synced_count INTEGER DEFAULT 0,
    coupons_synced_count INTEGER DEFAULT 0,
    sync_in_progress BOOLEAN DEFAULT false,
    sync_started_at TIMESTAMP WITH TIME ZONE,
    last_sync_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id)
);

-- 3. Mapeamento de produtos Tray ↔ Local
CREATE TABLE public.tray_product_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE,
    tray_product_id TEXT NOT NULL,
    local_product_id UUID,
    tray_product_data JSONB,
    name TEXT,
    sku TEXT,
    price NUMERIC(10,2),
    stock INTEGER,
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id, tray_product_id)
);

-- 4. Mapeamento de pedidos Tray ↔ Local
CREATE TABLE public.tray_order_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE,
    tray_order_id TEXT NOT NULL,
    local_conversation_id UUID REFERENCES public.conversations(id),
    tray_order_data JSONB,
    order_number TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    total NUMERIC(10,2),
    subtotal NUMERIC(10,2),
    shipping_value NUMERIC(10,2),
    discount NUMERIC(10,2),
    tray_status TEXT,
    local_status TEXT,
    payment_method TEXT,
    shipping_method TEXT,
    tracking_code TEXT,
    tracking_url TEXT,
    shipping_address JSONB,
    items JSONB,
    order_date TIMESTAMP WITH TIME ZONE,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id, tray_order_id)
);

-- 5. Mapeamento de cupons Tray ↔ Local
CREATE TABLE public.tray_coupon_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE,
    tray_coupon_id TEXT NOT NULL,
    local_coupon_id UUID,
    tray_coupon_data JSONB,
    code TEXT,
    discount_type TEXT,
    discount_value NUMERIC(10,2),
    min_value NUMERIC(10,2),
    max_uses INTEGER,
    uses_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id, tray_coupon_id)
);

-- 6. Mapeamento de clientes Tray ↔ Local
CREATE TABLE public.tray_customer_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE,
    tray_customer_id TEXT NOT NULL,
    local_client_id UUID REFERENCES public.clients(id),
    tray_customer_data JSONB,
    name TEXT,
    email TEXT,
    phone TEXT,
    document TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id, tray_customer_id)
);

-- 7. Logs de webhook
CREATE TABLE public.tray_commerce_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.tray_commerce_connections(id) ON DELETE SET NULL,
    law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    payload_summary JSONB,
    raw_payload JSONB,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Logs de auditoria
CREATE TABLE public.tray_commerce_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.tray_commerce_connections(id) ON DELETE SET NULL,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES auth.users(id),
    source TEXT DEFAULT 'user' CHECK (source IN ('user', 'automation', 'ai', 'webhook', 'sync')),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_tray_commerce_connections_law_firm ON public.tray_commerce_connections(law_firm_id);
CREATE INDEX idx_tray_commerce_connections_status ON public.tray_commerce_connections(connection_status);
CREATE INDEX idx_tray_commerce_connections_active ON public.tray_commerce_connections(is_active);

CREATE INDEX idx_tray_product_map_connection ON public.tray_product_map(connection_id);
CREATE INDEX idx_tray_product_map_tray_id ON public.tray_product_map(tray_product_id);

CREATE INDEX idx_tray_order_map_connection ON public.tray_order_map(connection_id);
CREATE INDEX idx_tray_order_map_tray_id ON public.tray_order_map(tray_order_id);
CREATE INDEX idx_tray_order_map_status ON public.tray_order_map(tray_status);
CREATE INDEX idx_tray_order_map_date ON public.tray_order_map(order_date DESC);

CREATE INDEX idx_tray_coupon_map_connection ON public.tray_coupon_map(connection_id);
CREATE INDEX idx_tray_coupon_map_code ON public.tray_coupon_map(code);

CREATE INDEX idx_tray_customer_map_connection ON public.tray_customer_map(connection_id);
CREATE INDEX idx_tray_customer_map_email ON public.tray_customer_map(email);

CREATE INDEX idx_tray_commerce_webhook_logs_connection ON public.tray_commerce_webhook_logs(connection_id);
CREATE INDEX idx_tray_commerce_webhook_logs_created ON public.tray_commerce_webhook_logs(created_at DESC);

CREATE INDEX idx_tray_commerce_audit_logs_connection ON public.tray_commerce_audit_logs(connection_id);
CREATE INDEX idx_tray_commerce_audit_logs_law_firm ON public.tray_commerce_audit_logs(law_firm_id);
CREATE INDEX idx_tray_commerce_audit_logs_created ON public.tray_commerce_audit_logs(created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.tray_commerce_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_commerce_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_product_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_order_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_coupon_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_customer_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_commerce_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tray_commerce_audit_logs ENABLE ROW LEVEL SECURITY;

-- Connections policies
CREATE POLICY "Users can view their law firm connections"
ON public.tray_commerce_connections FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage their law firm connections"
ON public.tray_commerce_connections FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- Sync state policies
CREATE POLICY "Users can view their connection sync state"
ON public.tray_commerce_sync_state FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Admins can manage their connection sync state"
ON public.tray_commerce_sync_state FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
) AND has_role(auth.uid(), 'admin'));

-- Product map policies
CREATE POLICY "Users can view their connection products"
ON public.tray_product_map FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Admins can manage their connection products"
ON public.tray_product_map FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
) AND has_role(auth.uid(), 'admin'));

-- Order map policies
CREATE POLICY "Users can view their connection orders"
ON public.tray_order_map FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Admins can manage their connection orders"
ON public.tray_order_map FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
) AND has_role(auth.uid(), 'admin'));

-- Coupon map policies
CREATE POLICY "Users can view their connection coupons"
ON public.tray_coupon_map FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Admins can manage their connection coupons"
ON public.tray_coupon_map FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
) AND has_role(auth.uid(), 'admin'));

-- Customer map policies
CREATE POLICY "Users can view their connection customers"
ON public.tray_customer_map FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Admins can manage their connection customers"
ON public.tray_customer_map FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.tray_commerce_connections c
    WHERE c.id = connection_id AND c.law_firm_id = get_user_law_firm_id(auth.uid())
) AND has_role(auth.uid(), 'admin'));

-- Webhook logs policies
CREATE POLICY "Users can view their webhook logs"
ON public.tray_commerce_webhook_logs FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "System can insert webhook logs"
ON public.tray_commerce_webhook_logs FOR INSERT
WITH CHECK (true);

-- Audit logs policies
CREATE POLICY "Users can view their audit logs"
ON public.tray_commerce_audit_logs FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "System can insert audit logs"
ON public.tray_commerce_audit_logs FOR INSERT
WITH CHECK (true);

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger para updated_at
CREATE TRIGGER update_tray_commerce_connections_updated_at
    BEFORE UPDATE ON public.tray_commerce_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tray_commerce_sync_state_updated_at
    BEFORE UPDATE ON public.tray_commerce_sync_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tray_product_map_updated_at
    BEFORE UPDATE ON public.tray_product_map
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tray_order_map_updated_at
    BEFORE UPDATE ON public.tray_order_map
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tray_coupon_map_updated_at
    BEFORE UPDATE ON public.tray_coupon_map
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tray_customer_map_updated_at
    BEFORE UPDATE ON public.tray_customer_map
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para garantir apenas uma conexão default por law_firm
CREATE OR REPLACE FUNCTION public.ensure_single_default_tray_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE public.tray_commerce_connections
        SET is_default = false
        WHERE law_firm_id = NEW.law_firm_id AND id != NEW.id AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_single_default_tray_connection
    BEFORE INSERT OR UPDATE ON public.tray_commerce_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_single_default_tray_connection();

-- Trigger para criar sync_state automaticamente
CREATE OR REPLACE FUNCTION public.create_tray_sync_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.tray_commerce_sync_state (connection_id)
    VALUES (NEW.id)
    ON CONFLICT (connection_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER create_tray_sync_state_on_connection
    AFTER INSERT ON public.tray_commerce_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.create_tray_sync_state();