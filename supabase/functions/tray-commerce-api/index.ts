import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Helper to bypass TypeScript for new tables not in generated types
// deno-lint-ignore no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

// Tray API base URLs pattern: https://{store}.tray.com.br/web_api/
interface TrayConnection {
  id: string;
  law_firm_id: string;
  store_name: string;
  store_url: string;
  tray_store_id: string | null;
  api_address: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  connection_status: string;
  sync_products: boolean;
  sync_orders: boolean;
  sync_customers: boolean;
  sync_coupons: boolean;
  sync_shipping: boolean;
  read_only_mode: boolean;
}

// Helper to make Tray API calls
async function trayApiCall(
  connection: TrayConnection,
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!connection.api_address || !connection.access_token) {
    return { success: false, error: "Missing API credentials" };
  }

  const url = `${connection.api_address}${endpoint}`;
  const separator = endpoint.includes("?") ? "&" : "?";
  const urlWithToken = `${url}${separator}access_token=${connection.access_token}`;

  try {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(urlWithToken, options);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || `HTTP ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Tray API error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Refresh token if expired
async function refreshTokenIfNeeded(
  supabase: ReturnType<typeof createClient>,
  connection: TrayConnection
): Promise<TrayConnection> {
  if (!connection.token_expires_at || !connection.refresh_token) {
    return connection;
  }

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();
  const bufferMinutes = 5;
  
  if (expiresAt.getTime() - now.getTime() > bufferMinutes * 60 * 1000) {
    return connection;
  }

  console.log("Refreshing Tray token for connection:", connection.id);

  try {
    const refreshUrl = `${connection.api_address}auth?refresh_token=${connection.refresh_token}`;
    const response = await fetch(refreshUrl, { method: "GET" });
    const data = await response.json();

    if (response.ok && data.access_token) {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (data.date_expiration_access_token || 86400));

      await supabase
        .from("tray_commerce_connections")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token || connection.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          connection_status: "connected",
          last_error: null,
        })
        .eq("id", connection.id);

      return {
        ...connection,
        access_token: data.access_token,
        refresh_token: data.refresh_token || connection.refresh_token,
        token_expires_at: expiresAt.toISOString(),
      };
    }
  } catch (error) {
    console.error("Token refresh error:", error);
    await supabase
      .from("tray_commerce_connections")
      .update({
        connection_status: "token_expired",
        last_error: "Failed to refresh token",
      })
      .eq("id", connection.id);
  }

  return connection;
}

// Validate tenant access
async function validateTenantAccess(
  supabase: AnySupabase,
  connectionId: string,
  lawFirmId: string
): Promise<{ valid: boolean; connection?: TrayConnection; error?: string }> {
  const { data: connection, error } = await supabase
    .from("tray_commerce_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("law_firm_id", lawFirmId)
    .maybeSingle();

  if (error || !connection) {
    return { valid: false, error: "Connection not found or access denied" };
  }

  return { valid: true, connection: connection as TrayConnection };
}

// Log audit action
async function logAudit(
  supabase: AnySupabase,
  connectionId: string | null,
  lawFirmId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
  performedBy: string | null,
  source: string = "user"
) {
  await supabase.from("tray_commerce_audit_logs").insert({
    connection_id: connectionId,
    law_firm_id: lawFirmId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_values: oldValues,
    new_values: newValues,
    performed_by: performedBy,
    source,
  });
}

// Handlers
async function handleListConnections(
  supabase: AnySupabase,
  lawFirmId: string
) {
  const { data, error } = await supabase
    .from("tray_commerce_connections")
    .select(`
      *,
      tray_commerce_sync_state (*)
    `)
    .eq("law_firm_id", lawFirmId)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

async function handleConnect(
  supabase: AnySupabase,
  lawFirmId: string,
  userId: string,
  body: {
    store_name: string;
    store_url: string;
    consumer_key: string;
    consumer_secret: string;
    code?: string;
  }
) {
  const { store_name, store_url, consumer_key, consumer_secret, code } = body;

  // Extract API address from store URL
  let apiAddress = store_url;
  if (!apiAddress.endsWith("/")) apiAddress += "/";
  if (!apiAddress.includes("web_api")) apiAddress += "web_api/";

  // Check for existing connection
  const { data: existing } = await supabase
    .from("tray_commerce_connections")
    .select("id")
    .eq("law_firm_id", lawFirmId)
    .eq("store_url", store_url)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "Esta loja já está conectada" };
  }

  // Get access token from Tray
  let accessToken = null;
  let refreshToken = null;
  let tokenExpiresAt = null;

  if (code) {
    try {
      const authUrl = `${apiAddress}auth?consumer_key=${consumer_key}&consumer_secret=${consumer_secret}&code=${code}`;
      const authResponse = await fetch(authUrl);
      const authData = await authResponse.json();

      if (authResponse.ok && authData.access_token) {
        accessToken = authData.access_token;
        refreshToken = authData.refresh_token;
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (authData.date_expiration_access_token || 86400));
        tokenExpiresAt = expiresAt.toISOString();
      } else {
        return { success: false, error: authData.message || "Failed to authenticate with Tray" };
      }
    } catch (error) {
      console.error("Auth error:", error);
      return { success: false, error: "Failed to connect to Tray API" };
    }
  }

  // Check if this is the first connection
  const { count } = await supabase
    .from("tray_commerce_connections")
    .select("id", { count: "exact", head: true })
    .eq("law_firm_id", lawFirmId);

  const isDefault = count === 0;

  // Create connection
  const { data: connection, error } = await supabase
    .from("tray_commerce_connections")
    .insert({
      law_firm_id: lawFirmId,
      store_name,
      store_url,
      api_address: apiAddress,
      consumer_key,
      consumer_secret,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      is_active: !!accessToken,
      is_default: isDefault,
      connection_status: accessToken ? "connected" : "disconnected",
      connected_at: accessToken ? new Date().toISOString() : null,
      connected_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
    return { success: false, error: error.message };
  }

  await logAudit(
    supabase,
    connection.id,
    lawFirmId,
    "connection_created",
    "connection",
    connection.id,
    null,
    { store_name, store_url },
    userId,
    "user"
  );

  return { success: true, data: connection };
}

async function handleDisconnect(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  userId: string
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { error } = await supabase
    .from("tray_commerce_connections")
    .delete()
    .eq("id", connectionId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit(
    supabase,
    null,
    lawFirmId,
    "connection_deleted",
    "connection",
    connectionId,
    { store_name: validation.connection?.store_name },
    null,
    userId,
    "user"
  );

  return { success: true };
}

async function handleToggle(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  userId: string,
  body: { is_active: boolean }
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { error } = await supabase
    .from("tray_commerce_connections")
    .update({ is_active: body.is_active })
    .eq("id", connectionId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit(
    supabase,
    connectionId,
    lawFirmId,
    body.is_active ? "connection_activated" : "connection_deactivated",
    "connection",
    connectionId,
    { is_active: !body.is_active },
    { is_active: body.is_active },
    userId,
    "user"
  );

  return { success: true };
}

async function handleUpdateSettings(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  userId: string,
  body: {
    sync_products?: boolean;
    sync_orders?: boolean;
    sync_customers?: boolean;
    sync_coupons?: boolean;
    sync_shipping?: boolean;
    read_only_mode?: boolean;
    is_default?: boolean;
  }
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { error } = await supabase
    .from("tray_commerce_connections")
    .update(body)
    .eq("id", connectionId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit(
    supabase,
    connectionId,
    lawFirmId,
    "settings_updated",
    "connection",
    connectionId,
    null,
    body,
    userId,
    "user"
  );

  return { success: true };
}

async function handleSyncProducts(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid || !validation.connection) {
    return { success: false, error: validation.error };
  }

  let connection = await refreshTokenIfNeeded(supabase, validation.connection);

  if (!connection.sync_products) {
    return { success: false, error: "Product sync is disabled" };
  }

  // Mark sync in progress
  await supabase
    .from("tray_commerce_sync_state")
    .update({ sync_in_progress: true, sync_started_at: new Date().toISOString() })
    .eq("connection_id", connectionId);

  try {
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;

    while (hasMore) {
      const result = await trayApiCall(connection, `products?limit=50&page=${page}`);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const products = (result.data as { Products?: unknown[] })?.Products || [];
      
      if (products.length === 0) {
        hasMore = false;
        break;
      }

      for (const product of products) {
        const p = product as Record<string, unknown>;
        const productData = p.Product as Record<string, unknown>;
        
        await supabase.from("tray_product_map").upsert({
          connection_id: connectionId,
          tray_product_id: String(productData.id),
          tray_product_data: productData,
          name: productData.name as string,
          sku: productData.reference as string,
          price: parseFloat(String(productData.price)) || 0,
          stock: parseInt(String(productData.stock)) || 0,
          is_active: productData.available === "1",
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: "connection_id,tray_product_id",
        });
        
        totalSynced++;
      }

      page++;
      if (products.length < 50) hasMore = false;
    }

    // Update sync state
    await supabase
      .from("tray_commerce_sync_state")
      .update({
        sync_in_progress: false,
        last_products_sync_at: new Date().toISOString(),
        products_synced_count: totalSynced,
        last_sync_error: null,
      })
      .eq("connection_id", connectionId);

    return { success: true, synced: totalSynced };
  } catch (error) {
    console.error("Sync products error:", error);
    
    await supabase
      .from("tray_commerce_sync_state")
      .update({
        sync_in_progress: false,
        last_sync_error: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("connection_id", connectionId);

    return { success: false, error: error instanceof Error ? error.message : "Sync failed" };
  }
}

async function handleSyncOrders(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  status?: string
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid || !validation.connection) {
    return { success: false, error: validation.error };
  }

  let connection = await refreshTokenIfNeeded(supabase, validation.connection);

  if (!connection.sync_orders) {
    return { success: false, error: "Order sync is disabled" };
  }

  try {
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;
    let endpoint = `orders?limit=50&page=${page}`;
    if (status) endpoint += `&status=${status}`;

    while (hasMore) {
      const result = await trayApiCall(connection, endpoint);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const orders = (result.data as { Orders?: unknown[] })?.Orders || [];
      
      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      for (const order of orders) {
        const o = order as Record<string, unknown>;
        const orderData = o.Order as Record<string, unknown>;
        
        await supabase.from("tray_order_map").upsert({
          connection_id: connectionId,
          tray_order_id: String(orderData.id),
          tray_order_data: orderData,
          order_number: orderData.id as string,
          customer_name: (orderData.Customer as Record<string, unknown>)?.name as string,
          customer_email: (orderData.Customer as Record<string, unknown>)?.email as string,
          customer_phone: (orderData.Customer as Record<string, unknown>)?.cellphone as string,
          total: parseFloat(String(orderData.total)) || 0,
          subtotal: parseFloat(String(orderData.sub_total)) || 0,
          shipping_value: parseFloat(String(orderData.shipment_value)) || 0,
          discount: parseFloat(String(orderData.discount)) || 0,
          tray_status: orderData.status as string,
          payment_method: orderData.payment_method as string,
          shipping_method: orderData.shipment as string,
          tracking_code: orderData.tracking as string,
          order_date: orderData.date as string,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: "connection_id,tray_order_id",
        });
        
        totalSynced++;
      }

      page++;
      if (orders.length < 50) hasMore = false;
    }

    // Update sync state
    await supabase
      .from("tray_commerce_sync_state")
      .update({
        last_orders_sync_at: new Date().toISOString(),
        orders_synced_count: totalSynced,
      })
      .eq("connection_id", connectionId);

    return { success: true, synced: totalSynced };
  } catch (error) {
    console.error("Sync orders error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Sync failed" };
  }
}

async function handleSyncCoupons(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid || !validation.connection) {
    return { success: false, error: validation.error };
  }

  let connection = await refreshTokenIfNeeded(supabase, validation.connection);

  if (!connection.sync_coupons) {
    return { success: false, error: "Coupon sync is disabled" };
  }

  try {
    const result = await trayApiCall(connection, "coupons");
    
    if (!result.success) {
      throw new Error(result.error);
    }

    const coupons = (result.data as { Coupons?: unknown[] })?.Coupons || [];
    let totalSynced = 0;

    for (const coupon of coupons) {
      const c = coupon as Record<string, unknown>;
      const couponData = c.Coupon as Record<string, unknown>;
      
      await supabase.from("tray_coupon_map").upsert({
        connection_id: connectionId,
        tray_coupon_id: String(couponData.id),
        tray_coupon_data: couponData,
        code: couponData.coupon as string,
        discount_type: couponData.discount_type as string,
        discount_value: parseFloat(String(couponData.value)) || 0,
        min_value: parseFloat(String(couponData.minimum_value)) || 0,
        max_uses: parseInt(String(couponData.max_uses)) || null,
        uses_count: parseInt(String(couponData.uses)) || 0,
        is_active: couponData.status === "1",
        starts_at: couponData.start_date as string,
        expires_at: couponData.end_date as string,
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: "connection_id,tray_coupon_id",
      });
      
      totalSynced++;
    }

    await supabase
      .from("tray_commerce_sync_state")
      .update({
        last_coupons_sync_at: new Date().toISOString(),
        coupons_synced_count: totalSynced,
      })
      .eq("connection_id", connectionId);

    return { success: true, synced: totalSynced };
  } catch (error) {
    console.error("Sync coupons error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Sync failed" };
  }
}

async function handleGetProducts(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  page: number = 1,
  limit: number = 50
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { data, error, count } = await supabase
    .from("tray_product_map")
    .select("*", { count: "exact" })
    .eq("connection_id", connectionId)
    .order("name")
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data, total: count, page, limit };
}

async function handleGetOrders(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  status?: string,
  page: number = 1,
  limit: number = 50
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  let query = supabase
    .from("tray_order_map")
    .select("*", { count: "exact" })
    .eq("connection_id", connectionId);

  if (status) {
    query = query.eq("tray_status", status);
  }

  const { data, error, count } = await query
    .order("order_date", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data, total: count, page, limit };
}

async function handleGetCoupons(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { data, error } = await supabase
    .from("tray_coupon_map")
    .select("*")
    .eq("connection_id", connectionId)
    .order("code");

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

async function handleUpdateOrderStatus(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  trayOrderId: string,
  userId: string,
  body: { status: string; tracking_code?: string }
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid || !validation.connection) {
    return { success: false, error: validation.error };
  }

  if (validation.connection.read_only_mode) {
    return { success: false, error: "Connection is in read-only mode" };
  }

  let connection = await refreshTokenIfNeeded(supabase, validation.connection);

  const updateData: Record<string, unknown> = {
    Order: { status: body.status },
  };
  if (body.tracking_code) {
    updateData.Order = { ...updateData.Order as object, tracking: body.tracking_code };
  }

  const result = await trayApiCall(connection, `orders/${trayOrderId}`, "PUT", updateData);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Update local map
  await supabase
    .from("tray_order_map")
    .update({
      tray_status: body.status,
      tracking_code: body.tracking_code || null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("connection_id", connectionId)
    .eq("tray_order_id", trayOrderId);

  await logAudit(
    supabase,
    connectionId,
    lawFirmId,
    "order_status_updated",
    "order",
    trayOrderId,
    null,
    body,
    userId,
    "user"
  );

  return { success: true };
}

async function handleUpdateProductStock(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  trayProductId: string,
  userId: string,
  body: { stock?: number; price?: number }
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid || !validation.connection) {
    return { success: false, error: validation.error };
  }

  if (validation.connection.read_only_mode) {
    return { success: false, error: "Connection is in read-only mode" };
  }

  let connection = await refreshTokenIfNeeded(supabase, validation.connection);

  const updateData: Record<string, unknown> = { Product: {} };
  if (body.stock !== undefined) {
    (updateData.Product as Record<string, unknown>).stock = body.stock;
  }
  if (body.price !== undefined) {
    (updateData.Product as Record<string, unknown>).price = body.price;
  }

  const result = await trayApiCall(connection, `products/${trayProductId}`, "PUT", updateData);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Update local map
  const localUpdate: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
  if (body.stock !== undefined) localUpdate.stock = body.stock;
  if (body.price !== undefined) localUpdate.price = body.price;

  await supabase
    .from("tray_product_map")
    .update(localUpdate)
    .eq("connection_id", connectionId)
    .eq("tray_product_id", trayProductId);

  await logAudit(
    supabase,
    connectionId,
    lawFirmId,
    "product_updated",
    "product",
    trayProductId,
    null,
    body,
    userId,
    "user"
  );

  return { success: true };
}

async function handleCreateCoupon(
  supabase: AnySupabase,
  lawFirmId: string,
  connectionId: string,
  userId: string,
  body: {
    code: string;
    discount_type: string;
    discount_value: number;
    min_value?: number;
    max_uses?: number;
    starts_at?: string;
    expires_at?: string;
  }
) {
  const validation = await validateTenantAccess(supabase, connectionId, lawFirmId);
  if (!validation.valid || !validation.connection) {
    return { success: false, error: validation.error };
  }

  if (validation.connection.read_only_mode) {
    return { success: false, error: "Connection is in read-only mode" };
  }

  let connection = await refreshTokenIfNeeded(supabase, validation.connection);

  const couponData = {
    Coupon: {
      coupon: body.code,
      discount_type: body.discount_type,
      value: body.discount_value,
      minimum_value: body.min_value || 0,
      max_uses: body.max_uses || 0,
      start_date: body.starts_at,
      end_date: body.expires_at,
      status: "1",
    },
  };

  const result = await trayApiCall(connection, "coupons", "POST", couponData);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const createdCoupon = (result.data as { Coupon?: Record<string, unknown> })?.Coupon;

  if (createdCoupon) {
    await supabase.from("tray_coupon_map").insert({
      connection_id: connectionId,
      tray_coupon_id: String(createdCoupon.id),
      tray_coupon_data: createdCoupon,
      code: body.code,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      min_value: body.min_value,
      max_uses: body.max_uses,
      is_active: true,
      starts_at: body.starts_at,
      expires_at: body.expires_at,
    });
  }

  await logAudit(
    supabase,
    connectionId,
    lawFirmId,
    "coupon_created",
    "coupon",
    String(createdCoupon?.id || ""),
    null,
    body,
    userId,
    "user"
  );

  return { success: true, data: createdCoupon };
}

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return createCorsResponse({ error: "Missing authorization" }, 401, req);
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return createCorsResponse({ error: "Unauthorized" }, 401, req);
    }

    // Get user's law firm
    const { data: profile } = await supabase
      .from("profiles")
      .select("law_firm_id")
      .eq("id", user.id)
      .single();

    if (!profile?.law_firm_id) {
      return createCorsResponse({ error: "No law firm associated" }, 403, req);
    }

    const lawFirmId = profile.law_firm_id;
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const method = req.method;

    // Route handling
    // GET /tray-commerce-api/connections
    if (method === "GET" && pathParts.length === 1) {
      const result = await handleListConnections(supabase, lawFirmId);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // POST /tray-commerce-api/connect
    if (method === "POST" && pathParts[1] === "connect") {
      const body = await req.json();
      const result = await handleConnect(supabase, lawFirmId, user.id, body);
      return createCorsResponse(result, result.success ? 201 : 400, req);
    }

    // Connection-specific routes
    const connectionId = pathParts[1];
    if (!connectionId) {
      return createCorsResponse({ error: "Missing connection ID" }, 400, req);
    }

    // POST /tray-commerce-api/:connectionId/disconnect
    if (method === "POST" && pathParts[2] === "disconnect") {
      const result = await handleDisconnect(supabase, lawFirmId, connectionId, user.id);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // POST /tray-commerce-api/:connectionId/toggle
    if (method === "POST" && pathParts[2] === "toggle") {
      const body = await req.json();
      const result = await handleToggle(supabase, lawFirmId, connectionId, user.id, body);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // PUT /tray-commerce-api/:connectionId/settings
    if (method === "PUT" && pathParts[2] === "settings") {
      const body = await req.json();
      const result = await handleUpdateSettings(supabase, lawFirmId, connectionId, user.id, body);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // POST /tray-commerce-api/:connectionId/sync/products
    if (method === "POST" && pathParts[2] === "sync" && pathParts[3] === "products") {
      const result = await handleSyncProducts(supabase, lawFirmId, connectionId);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // POST /tray-commerce-api/:connectionId/sync/orders
    if (method === "POST" && pathParts[2] === "sync" && pathParts[3] === "orders") {
      const status = url.searchParams.get("status") || undefined;
      const result = await handleSyncOrders(supabase, lawFirmId, connectionId, status);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // POST /tray-commerce-api/:connectionId/sync/coupons
    if (method === "POST" && pathParts[2] === "sync" && pathParts[3] === "coupons") {
      const result = await handleSyncCoupons(supabase, lawFirmId, connectionId);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // GET /tray-commerce-api/:connectionId/products
    if (method === "GET" && pathParts[2] === "products") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const result = await handleGetProducts(supabase, lawFirmId, connectionId, page, limit);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // GET /tray-commerce-api/:connectionId/orders
    if (method === "GET" && pathParts[2] === "orders") {
      const status = url.searchParams.get("status") || undefined;
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const result = await handleGetOrders(supabase, lawFirmId, connectionId, status, page, limit);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // GET /tray-commerce-api/:connectionId/coupons
    if (method === "GET" && pathParts[2] === "coupons") {
      const result = await handleGetCoupons(supabase, lawFirmId, connectionId);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // PUT /tray-commerce-api/:connectionId/orders/:orderId/status
    if (method === "PUT" && pathParts[2] === "orders" && pathParts[4] === "status") {
      const orderId = pathParts[3];
      const body = await req.json();
      const result = await handleUpdateOrderStatus(supabase, lawFirmId, connectionId, orderId, user.id, body);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // PUT /tray-commerce-api/:connectionId/products/:productId
    if (method === "PUT" && pathParts[2] === "products" && pathParts[3]) {
      const productId = pathParts[3];
      const body = await req.json();
      const result = await handleUpdateProductStock(supabase, lawFirmId, connectionId, productId, user.id, body);
      return createCorsResponse(result, result.success ? 200 : 400, req);
    }

    // POST /tray-commerce-api/:connectionId/coupons
    if (method === "POST" && pathParts[2] === "coupons") {
      const body = await req.json();
      const result = await handleCreateCoupon(supabase, lawFirmId, connectionId, user.id, body);
      return createCorsResponse(result, result.success ? 201 : 400, req);
    }

    return createCorsResponse({ error: "Not found" }, 404, req);
  } catch (error) {
    console.error("Tray Commerce API error:", error);
    return createCorsResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
      req
    );
  }
});
