import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TemplateBase {
  id: string;
  version: number;
  name: string;
  description: string | null;
  is_active: boolean;
  ai_provider: string;
  ai_prompt: string | null;
  ai_temperature: number | null;
  response_delay_seconds: number | null;
  ai_capabilities: {
    auto_reply?: boolean;
    summary?: boolean;
    transcription?: boolean;
    classification?: boolean;
  };
  default_automation_name: string | null;
  default_automation_description: string | null;
  default_automation_trigger_type: string | null;
  default_automation_trigger_config: Record<string, unknown> | null;
  default_departments: Array<{
    name: string;
    color: string;
    icon: string;
    position?: number;
  }>;
  default_statuses: Array<{
    name: string;
    color: string;
    position: number;
  }>;
  default_tags: Array<{
    name: string;
    color: string;
  }>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface TemplateKnowledgeItem {
  id: string;
  template_id: string;
  title: string;
  content: string | null;
  category: string;
  item_type: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: number;
  template_snapshot: TemplateBase;
  knowledge_items_snapshot: TemplateKnowledgeItem[] | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

export function useTemplateBase() {
  const queryClient = useQueryClient();

  // Fetch active template
  const { data: template, isLoading, error, refetch } = useQuery({
    queryKey: ["template-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_template_base")
        .select("*")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No template found
          return null;
        }
        throw error;
      }

      return data as TemplateBase;
    },
  });

  // Fetch template knowledge items
  const { data: knowledgeItems = [], isLoading: isLoadingKnowledge } = useQuery({
    queryKey: ["template-knowledge-items", template?.id],
    queryFn: async () => {
      if (!template?.id) return [];

      const { data, error } = await supabase
        .from("template_knowledge_items")
        .select("*")
        .eq("template_id", template.id)
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;
      return data as TemplateKnowledgeItem[];
    },
    enabled: !!template?.id,
  });

  // Fetch template versions
  const { data: versions = [], isLoading: isLoadingVersions } = useQuery({
    queryKey: ["template-versions", template?.id],
    queryFn: async () => {
      if (!template?.id) return [];

      const { data, error } = await supabase
        .from("ai_template_versions")
        .select("*")
        .eq("template_id", template.id)
        .order("version", { ascending: false });

      if (error) throw error;
      return data as unknown as TemplateVersion[];
    },
    enabled: !!template?.id,
  });

  // Update template
  const updateTemplate = useMutation({
    mutationFn: async (updates: Partial<TemplateBase>) => {
      if (!template?.id) throw new Error("No template found");

      // Convert to database-compatible format
      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.ai_provider !== undefined) dbUpdates.ai_provider = updates.ai_provider;
      if (updates.ai_prompt !== undefined) dbUpdates.ai_prompt = updates.ai_prompt;
      if (updates.ai_temperature !== undefined) dbUpdates.ai_temperature = updates.ai_temperature;
      if (updates.response_delay_seconds !== undefined) dbUpdates.response_delay_seconds = updates.response_delay_seconds;
      if (updates.ai_capabilities !== undefined) dbUpdates.ai_capabilities = updates.ai_capabilities;
      if (updates.default_automation_name !== undefined) dbUpdates.default_automation_name = updates.default_automation_name;
      if (updates.default_automation_description !== undefined) dbUpdates.default_automation_description = updates.default_automation_description;
      if (updates.default_departments !== undefined) dbUpdates.default_departments = updates.default_departments;
      if (updates.default_statuses !== undefined) dbUpdates.default_statuses = updates.default_statuses;
      if (updates.default_tags !== undefined) dbUpdates.default_tags = updates.default_tags;

      const { data, error } = await supabase
        .from("ai_template_base")
        .update(dbUpdates)
        .eq("id", template.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-base"] });
      toast.success("Template atualizado com sucesso");
    },
    onError: (error) => {
      console.error("Error updating template:", error);
      toast.error("Erro ao atualizar template");
    },
  });

  // Create new version (snapshot)
  const createVersion = useMutation({
    mutationFn: async (notes?: string) => {
      if (!template?.id) throw new Error("No template found");

      // First, increment version on template
      const newVersion = template.version + 1;

      const { error: updateError } = await supabase
        .from("ai_template_base")
        .update({ version: newVersion })
        .eq("id", template.id);

      if (updateError) throw updateError;

      // Create version snapshot - use JSON.parse/stringify to ensure proper Json format
      const { data, error } = await supabase
        .from("ai_template_versions")
        .insert([{
          template_id: template.id,
          version: template.version,
          template_snapshot: JSON.parse(JSON.stringify(template)),
          knowledge_items_snapshot: JSON.parse(JSON.stringify(knowledgeItems)),
          notes,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-base"] });
      queryClient.invalidateQueries({ queryKey: ["template-versions"] });
      toast.success("Nova versão criada com sucesso");
    },
    onError: (error) => {
      console.error("Error creating version:", error);
      toast.error("Erro ao criar versão");
    },
  });

  // Add knowledge item
  const addKnowledgeItem = useMutation({
    mutationFn: async (item: Omit<TemplateKnowledgeItem, "id" | "template_id" | "created_at" | "updated_at">) => {
      if (!template?.id) throw new Error("No template found");

      const { data, error } = await supabase
        .from("template_knowledge_items")
        .insert({
          ...item,
          template_id: template.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-knowledge-items"] });
      toast.success("Item de conhecimento adicionado");
    },
    onError: (error) => {
      console.error("Error adding knowledge item:", error);
      toast.error("Erro ao adicionar item");
    },
  });

  // Update knowledge item
  const updateKnowledgeItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TemplateKnowledgeItem> }) => {
      const { data, error } = await supabase
        .from("template_knowledge_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-knowledge-items"] });
      toast.success("Item atualizado");
    },
    onError: (error) => {
      console.error("Error updating knowledge item:", error);
      toast.error("Erro ao atualizar item");
    },
  });

  // Delete knowledge item
  const deleteKnowledgeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("template_knowledge_items")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-knowledge-items"] });
      toast.success("Item removido");
    },
    onError: (error) => {
      console.error("Error deleting knowledge item:", error);
      toast.error("Erro ao remover item");
    },
  });

  return {
    template,
    knowledgeItems,
    versions,
    isLoading: isLoading || isLoadingKnowledge,
    isLoadingVersions,
    error,
    refetch,
    updateTemplate,
    createVersion,
    addKnowledgeItem,
    updateKnowledgeItem,
    deleteKnowledgeItem,
  };
}
