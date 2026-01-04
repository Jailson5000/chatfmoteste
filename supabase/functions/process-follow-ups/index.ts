import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeUrl(url: string): string {
  return (url || "").replace(/\/+$/, "").replace(/\/manager$/i, "");
}

interface ScheduledFollowUp {
  id: string;
  law_firm_id: string;
  client_id: string;
  conversation_id: string;
  follow_up_rule_id: string;
  template_id: string | null;
  scheduled_at: string;
}

interface Template {
  id: string;
  content: string;
  name: string;
  category: string;
}

interface Conversation {
  id: string;
  remote_jid: string;
  whatsapp_instance_id: string | null;
  law_firm_id: string;
}

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  law_firm_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Prefer instance-specific configuration; env vars act as a fallback.
    const evolutionBaseUrl = normalizeUrl(Deno.env.get("EVOLUTION_BASE_URL") ?? "");
    const evolutionGlobalApiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[process-follow-ups] Starting follow-up processing...");

    // Get all pending follow-ups that are due
    const { data: pendingFollowUps, error: fetchError } = await supabase
      .from("scheduled_follow_ups")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(50); // Process in batches

    if (fetchError) {
      console.error("[process-follow-ups] Error fetching pending follow-ups:", fetchError);
      throw fetchError;
    }

    if (!pendingFollowUps || pendingFollowUps.length === 0) {
      console.log("[process-follow-ups] No pending follow-ups to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-follow-ups] Found ${pendingFollowUps.length} pending follow-ups`);

    let successCount = 0;
    let failCount = 0;

    for (const followUp of pendingFollowUps as ScheduledFollowUp[]) {
      try {
        console.log(`[process-follow-ups] Processing follow-up ${followUp.id}`);

        // Get the template content
        if (!followUp.template_id) {
          console.log(`[process-follow-ups] No template configured for follow-up ${followUp.id}, skipping`);
          await supabase
            .from("scheduled_follow_ups")
            .update({ 
              status: "failed", 
              error_message: "No template configured" 
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        const { data: template, error: templateError } = await supabase
          .from("templates")
          .select("*")
          .eq("id", followUp.template_id)
          .single();

        if (templateError || !template) {
          console.error(`[process-follow-ups] Template not found for follow-up ${followUp.id}`);
          await supabase
            .from("scheduled_follow_ups")
            .update({ 
              status: "failed", 
              error_message: "Template not found" 
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        // Get conversation details
        const { data: conversation, error: convError } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", followUp.conversation_id)
          .single();

        if (convError || !conversation) {
          console.error(`[process-follow-ups] Conversation not found for follow-up ${followUp.id}`);
          await supabase
            .from("scheduled_follow_ups")
            .update({ 
              status: "failed", 
              error_message: "Conversation not found" 
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        // Get WhatsApp instance (prefer instance-specific api_url/api_key)
        let instanceName: string | null = null;
        let instanceApiUrl: string | null = null;
        let instanceApiKey: string | null = null;

        if (conversation.whatsapp_instance_id) {
          const { data: instance } = await supabase
            .from("whatsapp_instances")
            .select("instance_name, api_url, api_key")
            .eq("id", conversation.whatsapp_instance_id)
            .single();

          if (instance) {
            instanceName = instance.instance_name;
            instanceApiUrl = instance.api_url;
            instanceApiKey = instance.api_key;
          }
        }

        // If no specific instance, get a connected instance for the law firm
        if (!instanceName) {
          const { data: defaultInstance } = await supabase
            .from("whatsapp_instances")
            .select("instance_name, api_url, api_key")
            .eq("law_firm_id", followUp.law_firm_id)
            .eq("status", "connected")
            .order("updated_at", { ascending: false })
            .limit(1)
            .single();

          if (defaultInstance) {
            instanceName = defaultInstance.instance_name;
            instanceApiUrl = defaultInstance.api_url;
            instanceApiKey = defaultInstance.api_key;
          }
        }

        if (!instanceName) {
          console.error(`[process-follow-ups] No WhatsApp instance available for follow-up ${followUp.id}`);
          await supabase
            .from("scheduled_follow_ups")
            .update({ 
              status: "failed", 
              error_message: "No WhatsApp instance available" 
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        // Parse template content (handle media templates)
        const typedTemplate = template as Template;
        let messageContent = typedTemplate.content;
        let mediaUrl: string | null = null;
        let messageType = "text";

        // Check if it's a media template
        const mediaMatch = messageContent.match(/^\[(IMAGE|VIDEO|AUDIO)\](.*?)(?:\n(.*))?$/s);
        if (mediaMatch) {
          messageType = mediaMatch[1].toLowerCase();
          mediaUrl = mediaMatch[2];
          messageContent = mediaMatch[3] || "";
        }

        // Send message via Evolution API (use instance configuration when available)
        const apiUrl = normalizeUrl(instanceApiUrl || evolutionBaseUrl);
        const apiKey = instanceApiKey || evolutionGlobalApiKey;

        if (!apiUrl || !apiKey) {
          console.error("[process-follow-ups] Evolution API not configured", {
            hasApiUrl: !!apiUrl,
            hasApiKey: !!apiKey,
            instanceName,
            hasInstanceApiUrl: !!instanceApiUrl,
            hasInstanceApiKey: !!instanceApiKey,
          });
          await supabase
            .from("scheduled_follow_ups")
            .update({
              status: "failed",
              error_message: "Evolution API not configured",
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        if (!conversation.remote_jid) {
          console.error(`[process-follow-ups] Conversation missing remote_jid for follow-up ${followUp.id}`);
          await supabase
            .from("scheduled_follow_ups")
            .update({
              status: "failed",
              error_message: "Conversation missing remote_jid",
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        let sendEndpoint = `${apiUrl}/message/sendText/${instanceName}`;
        let sendBody: any = {
          number: conversation.remote_jid.replace("@s.whatsapp.net", ""),
          text: messageContent,
        };

        if (messageType !== "text" && mediaUrl) {
          sendEndpoint = `${apiUrl}/message/sendMedia/${instanceName}`;
          sendBody = {
            number: conversation.remote_jid.replace("@s.whatsapp.net", ""),
            mediatype: messageType,
            media: mediaUrl,
            caption: messageContent || undefined,
          };
        }

        const sendResponse = await fetch(sendEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify(sendBody),
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          console.error(`[process-follow-ups] Failed to send message: ${errorText}`);
          await supabase
            .from("scheduled_follow_ups")
            .update({ 
              status: "failed", 
              error_message: `Failed to send: ${errorText}` 
            })
            .eq("id", followUp.id);
          failCount++;
          continue;
        }

        const sendResult = await sendResponse.json();
        console.log(`[process-follow-ups] Message sent successfully for follow-up ${followUp.id}`);

        // Save message to database
        await supabase.from("messages").insert({
          conversation_id: followUp.conversation_id,
          content: messageContent,
          message_type: messageType,
          media_url: mediaUrl,
          sender_type: "system",
          is_from_me: true,
          ai_generated: false,
          whatsapp_message_id: sendResult.key?.id,
        });

        // Update conversation last_message_at
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", followUp.conversation_id);

        // Mark follow-up as sent
        await supabase
          .from("scheduled_follow_ups")
          .update({ 
            status: "sent", 
            sent_at: new Date().toISOString() 
          })
          .eq("id", followUp.id);

        successCount++;

        // Check if this follow-up has give_up_on_no_response enabled
        const { data: followUpRule } = await supabase
          .from("status_follow_ups")
          .select("give_up_on_no_response, give_up_status_id")
          .eq("id", followUp.follow_up_rule_id)
          .single();

        if (followUpRule?.give_up_on_no_response) {
          console.log(`[process-follow-ups] Give up triggered for client ${followUp.client_id}`);
          
          // Cancel any remaining pending follow-ups for this client
          await supabase
            .from("scheduled_follow_ups")
            .update({ 
              status: "cancelled", 
              cancelled_at: new Date().toISOString(),
              cancel_reason: "Give up on no response triggered" 
            })
            .eq("client_id", followUp.client_id)
            .eq("status", "pending")
            .neq("id", followUp.id);

          // Update client status if give_up_status_id is set
          if (followUpRule.give_up_status_id) {
            console.log(`[process-follow-ups] Updating client ${followUp.client_id} status to ${followUpRule.give_up_status_id}`);
            await supabase
              .from("clients")
              .update({ custom_status_id: followUpRule.give_up_status_id })
              .eq("id", followUp.client_id);
          }

          // Archive the conversation
          console.log(`[process-follow-ups] Archiving conversation ${followUp.conversation_id}`);
          await supabase
            .from("conversations")
            .update({ 
              archived_at: new Date().toISOString(),
              archived_reason: "Follow-up: desistir do lead",
              status: "archived"
            })
            .eq("id", followUp.conversation_id);
        }

      } catch (error: any) {
        console.error(`[process-follow-ups] Error processing follow-up ${followUp.id}:`, error);
        await supabase
          .from("scheduled_follow_ups")
          .update({ 
            status: "failed", 
            error_message: error.message || "Unknown error" 
          })
          .eq("id", followUp.id);
        failCount++;
      }
    }

    console.log(`[process-follow-ups] Completed. Success: ${successCount}, Failed: ${failCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: pendingFollowUps.length,
        sent: successCount,
        failed: failCount
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[process-follow-ups] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
