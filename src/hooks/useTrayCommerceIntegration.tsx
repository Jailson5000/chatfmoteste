import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface TrayCommerceConnection {
  id: string;
  law_firm_id: string;
  store_name: string;
  store_url: string;
  tray_store_id: string | null;
  api_address: string | null;
  is_active: boolean;
  is_default: boolean;
  sync_products: boolean;
  sync_orders: boolean;
  sync_customers: boolean;
  sync_coupons: boolean;
  sync_shipping: boolean;
  read_only_mode: boolean;
  connection_status: "disconnected" | "connected" | "error" | "token_expired";
  last_error: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
  tray_commerce_sync_state?: TrayCommerceSyncState | null;
}

export interface TrayCommerceSyncState {
  id: string;
  connection_id: string;
  last_products_sync_at: string | null;
  last_orders_sync_at: string | null;
  last_customers_sync_at: string | null;
  last_coupons_sync_at: string | null;
  last_shipping_sync_at: string | null;
  last_webhook_at: string | null;
  products_synced_count: number;
  orders_synced_count: number;
  customers_synced_count: number;
  coupons_synced_count: number;
  sync_in_progress: boolean;
}

export interface TrayProduct {
  id: string;
  connection_id: string;
  tray_product_id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  last_synced_at: string;
}

export interface TrayOrder {
  id: string;
  connection_id: string;
  tray_order_id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total: number;
  subtotal: number;
  shipping_value: number;
  discount: number;
  tray_status: string;
  payment_method: string | null;
  shipping_method: string | null;
  tracking_code: string | null;
  order_date: string | null;
  last_synced_at: string;
}

export interface TrayCoupon {
  id: string;
  connection_id: string;
  tray_coupon_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_value: number | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
}

export function useTrayCommerceConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections, isLoading, error } = useQuery({
    queryKey: ["tray-commerce-connections"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id)
        .single();

      if (!profile?.law_firm_id) return [];

      const { data, error } = await supabase
        .from("tray_commerce_connections")
        .select(`
          *,
          tray_commerce_sync_state (*)
        `)
        .eq("law_firm_id", profile.law_firm_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      // Transform data to match our interface
      return (data || []).map((conn: Record<string, unknown>) => ({
        ...conn,
        tray_commerce_sync_state: conn.tray_commerce_sync_state as TrayCommerceSyncState | null
      })) as TrayCommerceConnection[];
    },
    enabled: !!user,
  });

  const connectMutation = useMutation({
    mutationFn: async (data: {
      store_name: string;
      store_url: string;
      consumer_key: string;
      consumer_secret: string;
      code?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke("tray-commerce-api/connect", {
        body: data,
      });
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      toast.success("Loja Tray conectada com sucesso!");
    },
    onError: (error) => {
      console.error("Connect error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao conectar loja");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/disconnect`,
        { method: "POST" }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      toast.success("Loja desconectada");
    },
    onError: (error) => {
      console.error("Disconnect error:", error);
      toast.error("Erro ao desconectar loja");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ connectionId, isActive }: { connectionId: string; isActive: boolean }) => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/toggle`,
        { body: { is_active: isActive } }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      toast.success(isActive ? "Integração ativada" : "Integração desativada");
    },
    onError: (error) => {
      toast.error("Erro ao alterar status");
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async ({
      connectionId,
      settings,
    }: {
      connectionId: string;
      settings: {
        sync_products?: boolean;
        sync_orders?: boolean;
        sync_customers?: boolean;
        sync_coupons?: boolean;
        sync_shipping?: boolean;
        read_only_mode?: boolean;
        is_default?: boolean;
      };
    }) => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/settings`,
        { method: "PUT", body: settings }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      toast.success("Configurações atualizadas");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar configurações");
    },
  });

  return {
    connections: connections || [],
    isLoading,
    error,
    connect: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    disconnect: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
    toggle: toggleMutation.mutateAsync,
    isToggling: toggleMutation.isPending,
    updateSettings: updateSettingsMutation.mutateAsync,
    isUpdatingSettings: updateSettingsMutation.isPending,
  };
}

export function useTrayCommerceSync(connectionId: string) {
  const queryClient = useQueryClient();

  const syncProductsMutation = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/sync/products`,
        { method: "POST" }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-products", connectionId] });
      toast.success(`${result.synced} produtos sincronizados`);
    },
    onError: (error) => {
      toast.error("Erro ao sincronizar produtos");
    },
  });

  const syncOrdersMutation = useMutation({
    mutationFn: async (status?: string) => {
      const url = status
        ? `tray-commerce-api/${connectionId}/sync/orders?status=${status}`
        : `tray-commerce-api/${connectionId}/sync/orders`;
      const { data: result, error } = await supabase.functions.invoke(url, { method: "POST" });
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-orders", connectionId] });
      toast.success(`${result.synced} pedidos sincronizados`);
    },
    onError: (error) => {
      toast.error("Erro ao sincronizar pedidos");
    },
  });

  const syncCouponsMutation = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/sync/coupons`,
        { method: "POST" }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-connections"] });
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-coupons", connectionId] });
      toast.success(`${result.synced} cupons sincronizados`);
    },
    onError: (error) => {
      toast.error("Erro ao sincronizar cupons");
    },
  });

  return {
    syncProducts: syncProductsMutation.mutateAsync,
    isSyncingProducts: syncProductsMutation.isPending,
    syncOrders: syncOrdersMutation.mutateAsync,
    isSyncingOrders: syncOrdersMutation.isPending,
    syncCoupons: syncCouponsMutation.mutateAsync,
    isSyncingCoupons: syncCouponsMutation.isPending,
  };
}

export function useTrayCommerceProducts(connectionId: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ["tray-commerce-products", connectionId, page, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tray_product_map")
        .select("*", { count: "exact" })
        .eq("connection_id", connectionId)
        .order("name")
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;
      return { data: data as TrayProduct[], total: data.length };
    },
    enabled: !!connectionId,
  });
}

export function useTrayCommerceOrders(connectionId: string, status?: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ["tray-commerce-orders", connectionId, status, page, limit],
    queryFn: async () => {
      let query = supabase
        .from("tray_order_map")
        .select("*", { count: "exact" })
        .eq("connection_id", connectionId);

      if (status) {
        query = query.eq("tray_status", status);
      }

      const { data, error } = await query
        .order("order_date", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;
      return { data: data as TrayOrder[], total: data.length };
    },
    enabled: !!connectionId,
  });
}

export function useTrayCommerceCoupons(connectionId: string) {
  return useQuery({
    queryKey: ["tray-commerce-coupons", connectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tray_coupon_map")
        .select("*")
        .eq("connection_id", connectionId)
        .order("code");

      if (error) throw error;
      return data as TrayCoupon[];
    },
    enabled: !!connectionId,
  });
}

export function useTrayCommerceActions(connectionId: string) {
  const queryClient = useQueryClient();

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
      trackingCode,
    }: {
      orderId: string;
      status: string;
      trackingCode?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/orders/${orderId}/status`,
        { method: "PUT", body: { status, tracking_code: trackingCode } }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-orders", connectionId] });
      toast.success("Status do pedido atualizado");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status do pedido");
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({
      productId,
      stock,
      price,
    }: {
      productId: string;
      stock?: number;
      price?: number;
    }) => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/products/${productId}`,
        { method: "PUT", body: { stock, price } }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-products", connectionId] });
      toast.success("Produto atualizado");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar produto");
    },
  });

  const createCouponMutation = useMutation({
    mutationFn: async (data: {
      code: string;
      discount_type: string;
      discount_value: number;
      min_value?: number;
      max_uses?: number;
      starts_at?: string;
      expires_at?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke(
        `tray-commerce-api/${connectionId}/coupons`,
        { method: "POST", body: data }
      );
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tray-commerce-coupons", connectionId] });
      toast.success("Cupom criado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao criar cupom");
    },
  });

  return {
    updateOrderStatus: updateOrderStatusMutation.mutateAsync,
    isUpdatingOrderStatus: updateOrderStatusMutation.isPending,
    updateProduct: updateProductMutation.mutateAsync,
    isUpdatingProduct: updateProductMutation.isPending,
    createCoupon: createCouponMutation.mutateAsync,
    isCreatingCoupon: createCouponMutation.isPending,
  };
}
