import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface N8nWorkflow {
  id: string;
  name: string;
  nodes: any[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  active?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: adminRole } = await supabase
      .from('admin_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Acesso negado - apenas administradores' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get N8N settings from system_settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['n8n_base_url', 'n8n_api_key']);

    const n8nSettings: Record<string, string> = {};
    settings?.forEach((s: any) => {
      n8nSettings[s.key] = typeof s.value === 'string' ? s.value.replace(/^"|"$/g, '') : String(s.value);
    });

    const n8nBaseUrl = n8nSettings.n8n_base_url;
    const n8nApiKey = n8nSettings.n8n_api_key;

    if (!n8nBaseUrl || !n8nApiKey) {
      return new Response(JSON.stringify({ error: 'Configurações do N8N não encontradas' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    // Backwards compatible: accept both workflowId and workflow_id
    const { action, workflowId: workflowIdFromBody, workflow_id, updates, nodeUpdates } = body;
    const workflowId = workflowIdFromBody || workflow_id;

    // Validate workflowId for actions that require it
    const actionsRequiringWorkflowId = new Set([
      'get',
      'update',
      'update_node',
      'add_node',
      'remove_node',
      'activate',
      'deactivate',
      'fix_miauchat_integration',
    ]);
    if (actionsRequiringWorkflowId.has(action) && !workflowId) {
      return new Response(JSON.stringify({ error: 'workflowId é obrigatório', success: false }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const n8nHeaders = {
      'X-N8N-API-KEY': n8nApiKey,
      'Content-Type': 'application/json',
    };

    // GET - Fetch workflow
    if (action === 'get') {
      const response = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        headers: n8nHeaders,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Erro ao buscar workflow: ${error}`);
      }

      const workflow = await response.json();
      return new Response(JSON.stringify({ success: true, workflow }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UPDATE - Update entire workflow
    if (action === 'update') {
      // First get the current workflow
      const getResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        headers: n8nHeaders,
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text().catch(() => '');
        throw new Error(`Erro ao buscar workflow atual (${getResponse.status}): ${errorText}`);
      }

      const currentWorkflow = await getResponse.json();

      // Merge updates
      const updatedWorkflow = {
        ...currentWorkflow,
        ...updates,
        nodes: updates.nodes || currentWorkflow.nodes,
        connections: updates.connections || currentWorkflow.connections,
      };

      // Update the workflow
      const updateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        headers: n8nHeaders,
        body: JSON.stringify(updatedWorkflow),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Erro ao atualizar workflow: ${error}`);
      }

      const result = await updateResponse.json();
      return new Response(JSON.stringify({ success: true, workflow: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UPDATE_NODE - Update specific node
    if (action === 'update_node') {
      const { nodeName, nodeConfig } = nodeUpdates;

      // Get current workflow
      const getResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        headers: n8nHeaders,
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text().catch(() => '');
        throw new Error(`Erro ao buscar workflow atual (${getResponse.status}): ${errorText}`);
      }

      const workflow = await getResponse.json();

      // Find and update the specific node
      const nodeIndex = workflow.nodes.findIndex((n: any) => n.name === nodeName);
      if (nodeIndex === -1) {
        return new Response(JSON.stringify({ error: `Node "${nodeName}" não encontrado` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      workflow.nodes[nodeIndex] = {
        ...workflow.nodes[nodeIndex],
        ...nodeConfig,
        parameters: {
          ...workflow.nodes[nodeIndex].parameters,
          ...nodeConfig.parameters,
        },
      };

      // Update the workflow
      const updateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        headers: n8nHeaders,
        body: JSON.stringify(workflow),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Erro ao atualizar node: ${error}`);
      }

      const result = await updateResponse.json();
      return new Response(JSON.stringify({ success: true, workflow: result, updatedNode: nodeName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ADD_NODE - Add a new node
    if (action === 'add_node') {
      const { newNode, connectFrom, connectTo } = nodeUpdates;

      const getResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        headers: n8nHeaders,
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text().catch(() => '');
        throw new Error(`Erro ao buscar workflow atual (${getResponse.status}): ${errorText}`);
      }

      const workflow = await getResponse.json();

      // Add the new node
      workflow.nodes.push(newNode);

      // Add connections if specified
      if (connectFrom) {
        if (!workflow.connections[connectFrom]) {
          workflow.connections[connectFrom] = { main: [[]] };
        }
        workflow.connections[connectFrom].main[0].push({
          node: newNode.name,
          type: 'main',
          index: 0,
        });
      }

      if (connectTo) {
        if (!workflow.connections[newNode.name]) {
          workflow.connections[newNode.name] = { main: [[]] };
        }
        workflow.connections[newNode.name].main[0].push({
          node: connectTo,
          type: 'main',
          index: 0,
        });
      }

      const updateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        headers: n8nHeaders,
        body: JSON.stringify(workflow),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Erro ao adicionar node: ${error}`);
      }

      const result = await updateResponse.json();
      return new Response(JSON.stringify({ success: true, workflow: result, addedNode: newNode.name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // REMOVE_NODE - Remove a node
    if (action === 'remove_node') {
      const { nodeName } = nodeUpdates;

      const getResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        headers: n8nHeaders,
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text().catch(() => '');
        throw new Error(`Erro ao buscar workflow atual (${getResponse.status}): ${errorText}`);
      }

      const workflow = await getResponse.json();

      // Remove the node
      workflow.nodes = workflow.nodes.filter((n: any) => n.name !== nodeName);

      // Remove connections to/from this node
      delete workflow.connections[nodeName];
      for (const key in workflow.connections) {
        if (workflow.connections[key].main) {
          workflow.connections[key].main = workflow.connections[key].main.map((outputs: any[]) =>
            outputs.filter((conn: any) => conn.node !== nodeName)
          );
        }
      }

      const updateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        headers: n8nHeaders,
        body: JSON.stringify(workflow),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Erro ao remover node: ${error}`);
      }

      const result = await updateResponse.json();
      return new Response(JSON.stringify({ success: true, workflow: result, removedNode: nodeName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTIVATE/DEACTIVATE
    if (action === 'activate' || action === 'deactivate') {
      const endpoint = action === 'activate' 
        ? `${n8nBaseUrl}/api/v1/workflows/${workflowId}/activate`
        : `${n8nBaseUrl}/api/v1/workflows/${workflowId}/deactivate`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: n8nHeaders,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Erro ao ${action === 'activate' ? 'ativar' : 'desativar'} workflow: ${error}`);
      }

      const result = await response.json();
      return new Response(JSON.stringify({ success: true, workflow: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // FIX_MIAUCHAT_INTEGRATION - Special action to fix MiauChat integration
    if (action === 'fix_miauchat_integration') {
      console.log('Iniciando correção da integração MiauChat...');

      // Get current workflow
      const getResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        headers: n8nHeaders,
      });

      if (!getResponse.ok) {
        const errorText = await getResponse.text().catch(() => '');
        throw new Error(`Erro ao buscar workflow atual (${getResponse.status}): ${errorText}`);
      }

      const workflow = await getResponse.json();
      const changes: string[] = [];

      // Find the webhook node
      const webhookNode = workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
      if (!webhookNode) {
        throw new Error('Node Webhook não encontrado');
      }

      // Update webhook to respond with last node
      webhookNode.parameters = {
        ...webhookNode.parameters,
        responseMode: 'lastNode',
        options: {
          ...webhookNode.parameters?.options,
          responseContentType: 'application/json',
        },
      };
      changes.push('Webhook configurado com responseMode: lastNode');

      // Find ALL existing respondToWebhook nodes
      const existingRespondNodes = workflow.nodes.filter((n: any) => 
        n.type === 'n8n-nodes-base.respondToWebhook'
      );
      console.log(`Found ${existingRespondNodes.length} existing respondToWebhook nodes`);

      // Find HTTP Request nodes that send to Evolution API (should be removed)
      const httpNodesToRemove = workflow.nodes
        .filter((n: any) => 
          n.type === 'n8n-nodes-base.httpRequest' && 
          n.parameters?.url?.includes('evo.') &&
          n.parameters?.url?.includes('message/send')
        )
        .map((n: any) => n.name);

      console.log('Nodes HTTP para remover:', httpNodesToRemove);

      // Find agent nodes (the ones that generate responses)
      const agentNodes = workflow.nodes.filter((n: any) => 
        n.type === '@n8n/n8n-nodes-langchain.agent'
      );

      // CRITICAL: Configure ALL AI Agent nodes to use dynamic prompt from MiauChat
      const dynamicSystemMessage = `{{ $json.automation?.prompt || $('Webhook').item.json.automation?.prompt || "Você é um assistente virtual prestativo." }}

=== BASE DE CONHECIMENTO ===
{{ ($json.knowledge_base || $('Webhook').item.json.knowledge_base || []).map(k => "### " + k.title + "\\n" + k.content).join("\\n\\n") || "Nenhuma base de conhecimento configurada." }}

=== MEMÓRIAS DO CLIENTE ===
{{ ($json.client?.memories || $('Webhook').item.json.client?.memories || []).map(m => "- " + m.fact_type + ": " + m.content).join("\\n") || "Nenhuma memória registrada." }}

=== INSTRUÇÕES ===
- Responda de forma concisa e direta (máximo 3-4 parágrafos curtos)
- Use quebras de linha para separar ideias
- Não repita informações
- Seja objetivo e amigável`;

      for (const agentNode of agentNodes) {
        const nodeInWorkflow = workflow.nodes.find((n: any) => n.name === agentNode.name);
        if (nodeInWorkflow) {
          console.log(`Configuring AI Agent "${agentNode.name}" to use dynamic prompt from MiauChat`);
          nodeInWorkflow.parameters = {
            ...nodeInWorkflow.parameters,
            systemMessage: dynamicSystemMessage,
          };
          changes.push(`Agente "${agentNode.name}" configurado para usar prompt do MiauChat`);
        }
      }

      // Check if any respondToWebhook node is PROPERLY CONNECTED to an output
      const checkNodeIsConnected = (nodeName: string): boolean => {
        for (const sourceNode in workflow.connections) {
          const connections = workflow.connections[sourceNode];
          if (connections?.main) {
            for (const outputArray of connections.main) {
              if (outputArray?.some((conn: any) => conn.node === nodeName)) {
                return true;
              }
            }
          }
        }
        return false;
      };

      // Remove ALL unconnected respondToWebhook nodes (they cause the error!)
      const unconnectedRespondNodes = existingRespondNodes.filter(
        (n: any) => !checkNodeIsConnected(n.name)
      );
      
      if (unconnectedRespondNodes.length > 0) {
        console.log(`Removing ${unconnectedRespondNodes.length} unconnected respondToWebhook nodes`);
        const nodesToRemove = unconnectedRespondNodes.map((n: any) => n.name);
        workflow.nodes = workflow.nodes.filter((n: any) => !nodesToRemove.includes(n.name));
        
        // Also remove any connections FROM these nodes
        for (const nodeName of nodesToRemove) {
          delete workflow.connections[nodeName];
        }
        
        changes.push(`Removidos ${unconnectedRespondNodes.length} nodes respondToWebhook não conectados`);
      }

      // Now check again for connected respondToWebhook nodes
      const connectedRespondNodes = existingRespondNodes.filter(
        (n: any) => checkNodeIsConnected(n.name)
      );
      
      // If there's already a connected respond node, we're done
      if (connectedRespondNodes.length > 0) {
        console.log('Found connected respondToWebhook node, checking format...');
        
        // Update the respond node to use correct format
        for (const respondNode of connectedRespondNodes) {
          const nodeInWorkflow = workflow.nodes.find((n: any) => n.name === respondNode.name);
          if (nodeInWorkflow) {
            nodeInWorkflow.parameters = {
              respondWith: 'json',
              responseBody: '={{ JSON.stringify({ response: $json.output || $json.text || $json.message || $json, action: "send_text" }) }}',
            };
          }
        }
        changes.push('Node respondToWebhook atualizado com formato correto');
      } else if (agentNodes.length > 0) {
        // No connected respond node exists, need to add one
        const lastAgent = agentNodes[agentNodes.length - 1];
        
        const respondNode = {
          id: crypto.randomUUID(),
          name: 'Responder MiauChat',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1.1,
          position: [lastAgent.position[0] + 400, lastAgent.position[1]],
          parameters: {
            respondWith: 'json',
            responseBody: '={{ JSON.stringify({ response: $json.output || $json.text || $json.message || $json, action: "send_text" }) }}',
          },
        };

        workflow.nodes.push(respondNode);
        changes.push('Node "Responder MiauChat" adicionado');

        // Connect agent to respond node
        if (!workflow.connections[lastAgent.name]) {
          workflow.connections[lastAgent.name] = { main: [[]] };
        }
        
        // Replace connection to HTTP node with connection to Respond node
        if (workflow.connections[lastAgent.name].main) {
          workflow.connections[lastAgent.name].main[0] = workflow.connections[lastAgent.name].main[0]
            .filter((conn: any) => !httpNodesToRemove.includes(conn.node));
          
          workflow.connections[lastAgent.name].main[0].push({
            node: 'Responder MiauChat',
            type: 'main',
            index: 0,
          });
        }
        changes.push('Agente conectado ao node de resposta');
      }

      // Clean workflow object - N8N API requires specific fields
      const cleanWorkflow = {
        name: workflow.name,
        nodes: workflow.nodes.map((n: any) => {
          const cleanNode: any = {
            id: n.id,
            name: n.name,
            type: n.type,
            typeVersion: n.typeVersion,
            position: n.position,
            parameters: n.parameters,
          };
          if (n.credentials) cleanNode.credentials = n.credentials;
          if (n.webhookId) cleanNode.webhookId = n.webhookId;
          return cleanNode;
        }),
        connections: workflow.connections,
        settings: {
          executionOrder: workflow.settings?.executionOrder || 'v1',
        },
      };

      // Update the workflow using clean object
      const updateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        headers: n8nHeaders,
        body: JSON.stringify(cleanWorkflow),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Erro ao atualizar workflow: ${error}`);
      }

      const result = await updateResponse.json();
      
      return new Response(JSON.stringify({ 
        success: true, 
        workflow: result,
        changes: {
          webhookUpdated: true,
          unconnectedNodesRemoved: unconnectedRespondNodes.length,
          respondNodeAdded: connectedRespondNodes.length === 0 && agentNodes.length > 0,
          httpNodesIdentified: httpNodesToRemove,
          changesList: changes,
          message: `Workflow corrigido: ${changes.join('; ')}`
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro no n8n-workflow-manager:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
