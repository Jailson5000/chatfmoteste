import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// deno-lint-ignore no-explicit-any
type SupabaseAny = ReturnType<typeof createClient<any>>;

interface TrayWebhookPayload {
  scopeName?: string;
  scope_name?: string;
  act?: string;
  seller_id?: string;
  store_id?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase: SupabaseAny = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // Expected path: /tray-commerce-webhook/:connectionId or /:lawFirmId/:connectionId
    let connectionId: string | null = null;
    let lawFirmId: string | null = null;

    if (pathParts.length >= 2) {
      // /tray-commerce-webhook/:connectionId
      connectionId = pathParts[1];
    } else if (pathParts.length >= 3) {
      // /tray-commerce-webhook/:lawFirmId/:connectionId
      lawFirmId = pathParts[1];
      connectionId = pathParts[2];
    }

    // Try to get connection
    let connection: Record<string, unknown> | null = null;
    if (connectionId) {
      const { data } = await supabase
        .from("tray_commerce_connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();
      connection = data;
    }

    // Parse webhook payload
    let payload: TrayWebhookPayload = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries()) as unknown as TrayWebhookPayload;
    }

    const eventType = payload.scopeName || payload.scope_name || payload.act || "unknown";
    
    console.log("Received Tray webhook:", {
      connectionId,
      eventType,
      sellerId: payload.seller_id,
      storeId: payload.store_id,
    });

    // Log the webhook
    const webhookLogId = crypto.randomUUID();
    await supabase.from("tray_commerce_webhook_logs").insert({
      id: webhookLogId,
      connection_id: connection?.id || null,
      law_firm_id: connection?.law_firm_id || lawFirmId,
      event_type: eventType,
      payload_summary: {
        scope: eventType,
        seller_id: payload.seller_id,
        store_id: payload.store_id,
      },
      raw_payload: payload,
      processed: false,
    } as Record<string, unknown>);

    // If connection is not active, just log and return
    if (!connection || !connection.is_active) {
      console.log("Connection not found or inactive, webhook logged but not processed");
      return new Response(JSON.stringify({ received: true, processed: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process based on event type
    let processed = false;
    let processingError = null;

    try {
      switch (eventType.toLowerCase()) {
        case "order":
        case "order.created":
        case "order.updated":
        case "order.status_updated":
          if (connection.sync_orders) {
            await processOrderWebhook(supabase, connection, payload);
            processed = true;
          }
          break;

        case "product":
        case "product.updated":
        case "product.stock_updated":
          if (connection.sync_products) {
            await processProductWebhook(supabase, connection, payload);
            processed = true;
          }
          break;

        case "coupon":
        case "coupon.created":
        case "coupon.updated":
          if (connection.sync_coupons) {
            await processCouponWebhook(supabase, connection, payload);
            processed = true;
          }
          break;

        default:
          console.log("Unknown event type:", eventType);
      }
    } catch (error) {
      console.error("Error processing webhook:", error);
      processingError = error instanceof Error ? error.message : "Unknown error";
    }

    // Update webhook log
    await supabase
      .from("tray_commerce_webhook_logs")
      .update({
        processed,
        processed_at: processed ? new Date().toISOString() : null,
        error: processingError,
      } as Record<string, unknown>)
      .eq("id", webhookLogId);

    // Update sync state last webhook time
    if (processed) {
      await supabase
        .from("tray_commerce_sync_state")
        .update({ last_webhook_at: new Date().toISOString() } as Record<string, unknown>)
        .eq("connection_id", connection.id);
    }

    return new Response(JSON.stringify({ received: true, processed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processOrderWebhook(
  supabase: SupabaseAny,
  connection: Record<string, unknown>,
  payload: TrayWebhookPayload
) {
  const orderData = payload.data as Record<string, unknown>;
  if (!orderData?.id) {
    console.log("No order ID in webhook payload");
    return;
  }

  const orderId = String(orderData.id);
  
  // Check if we already have this order
  const { data: existingOrder } = await supabase
    .from("tray_order_map")
    .select("id, tray_status")
    .eq("connection_id", connection.id)
    .eq("tray_order_id", orderId)
    .maybeSingle();

  const existingOrderData = existingOrder as Record<string, unknown> | null;

  // Upsert the order
  await supabase.from("tray_order_map").upsert({
    connection_id: connection.id as string,
    tray_order_id: orderId,
    tray_order_data: orderData,
    order_number: orderId,
    customer_name: (orderData.customer as Record<string, unknown>)?.name as string || null,
    customer_email: (orderData.customer as Record<string, unknown>)?.email as string || null,
    customer_phone: (orderData.customer as Record<string, unknown>)?.cellphone as string || null,
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
  } as Record<string, unknown>, {
    onConflict: "connection_id,tray_order_id",
  });

  // Log the action
  await supabase.from("tray_commerce_audit_logs").insert({
    connection_id: connection.id as string,
    law_firm_id: connection.law_firm_id as string,
    action: existingOrderData ? "order_updated_via_webhook" : "order_created_via_webhook",
    entity_type: "order",
    entity_id: orderId,
    old_values: existingOrderData ? { status: existingOrderData.tray_status } : null,
    new_values: { status: orderData.status },
    source: "webhook",
  } as Record<string, unknown>);

  // Optionally create/update a conversation for the order
  if (!existingOrderData) {
    // New order - could create a conversation here
    console.log("New order received via webhook:", orderId);
  }
}

async function processProductWebhook(
  supabase: SupabaseAny,
  connection: Record<string, unknown>,
  payload: TrayWebhookPayload
) {
  const productData = payload.data as Record<string, unknown>;
  if (!productData?.id) {
    console.log("No product ID in webhook payload");
    return;
  }

  const productId = String(productData.id);

  await supabase.from("tray_product_map").upsert({
    connection_id: connection.id as string,
    tray_product_id: productId,
    tray_product_data: productData,
    name: productData.name as string,
    sku: productData.reference as string,
    price: parseFloat(String(productData.price)) || 0,
    stock: parseInt(String(productData.stock)) || 0,
    is_active: productData.available === "1",
    last_synced_at: new Date().toISOString(),
  } as Record<string, unknown>, {
    onConflict: "connection_id,tray_product_id",
  });

  await supabase.from("tray_commerce_audit_logs").insert({
    connection_id: connection.id as string,
    law_firm_id: connection.law_firm_id as string,
    action: "product_updated_via_webhook",
    entity_type: "product",
    entity_id: productId,
    new_values: { stock: productData.stock, price: productData.price },
    source: "webhook",
  } as Record<string, unknown>);
}

async function processCouponWebhook(
  supabase: SupabaseAny,
  connection: Record<string, unknown>,
  payload: TrayWebhookPayload
) {
  const couponData = payload.data as Record<string, unknown>;
  if (!couponData?.id) {
    console.log("No coupon ID in webhook payload");
    return;
  }

  const couponId = String(couponData.id);

  await supabase.from("tray_coupon_map").upsert({
    connection_id: connection.id as string,
    tray_coupon_id: couponId,
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
  } as Record<string, unknown>, {
    onConflict: "connection_id,tray_coupon_id",
  });

  await supabase.from("tray_commerce_audit_logs").insert({
    connection_id: connection.id as string,
    law_firm_id: connection.law_firm_id as string,
    action: "coupon_updated_via_webhook",
    entity_type: "coupon",
    entity_id: couponId,
    new_values: couponData,
    source: "webhook",
  } as Record<string, unknown>);
}
