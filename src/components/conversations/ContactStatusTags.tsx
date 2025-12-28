import { useState, useMemo } from "react";
import { Tag as TagIcon, CheckCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/useClients";
import { useCustomStatuses, CustomStatus } from "@/hooks/useCustomStatuses";
import { useTags, Tag } from "@/hooks/useTags";

interface ContactStatusTagsProps {
  clientId: string | null;
  conversationId: string;
  contactPhone: string | null;
  contactName: string | null;
}

export function ContactStatusTags({
  clientId,
  conversationId,
  contactPhone,
  contactName,
}: ContactStatusTagsProps) {
  const queryClient = useQueryClient();
  const { clients, updateClientStatus, createClient } = useClients();
  const { statuses } = useCustomStatuses();
  const { tags } = useTags();

  const [isLinking, setIsLinking] = useState(false);

  // Find the linked client
  const linkedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );

  // Get client's current tags
  const [clientTagIds, setClientTagIds] = useState<string[]>([]);

  // Fetch client tags when clientId changes
  const fetchClientTags = async (cId: string) => {
    const { data } = await supabase
      .from("client_tags")
      .select("tag_id")
      .eq("client_id", cId);
    setClientTagIds((data || []).map((t) => t.tag_id));
  };

  // Initial fetch
  useMemo(() => {
    if (clientId) {
      fetchClientTags(clientId);
    } else {
      setClientTagIds([]);
    }
  }, [clientId]);

  const handleStatusChange = async (statusId: string) => {
    if (!clientId) return;
    await updateClientStatus.mutateAsync({
      clientId,
      statusId: statusId === "none" ? null : statusId,
    });
  };

  const handleAddTag = async (tagId: string) => {
    if (!clientId || clientTagIds.includes(tagId)) return;

    await supabase.from("client_tags").insert({
      client_id: clientId,
      tag_id: tagId,
    });

    setClientTagIds((prev) => [...prev, tagId]);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!clientId) return;

    await supabase
      .from("client_tags")
      .delete()
      .eq("client_id", clientId)
      .eq("tag_id", tagId);

    setClientTagIds((prev) => prev.filter((id) => id !== tagId));
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  const handleLinkClient = async () => {
    if (!contactPhone) return;
    setIsLinking(true);

    try {
      // Check if client with this phone already exists
      const existingClient = clients.find((c) => c.phone === contactPhone);

      if (existingClient) {
        // Link existing client to conversation
        await supabase
          .from("conversations")
          .update({ client_id: existingClient.id })
          .eq("id", conversationId);
      } else {
        // Create new client and link
        const result = await createClient.mutateAsync({
          name: contactName || contactPhone,
          phone: contactPhone,
          email: null,
          document: null,
          address: null,
          notes: null,
          lgpd_consent: false,
          lgpd_consent_date: null,
          custom_status_id: null,
          department_id: null,
        });

        await supabase
          .from("conversations")
          .update({ client_id: result.id })
          .eq("id", conversationId);
      }

      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } finally {
      setIsLinking(false);
    }
  };

  const currentStatus = statuses.find((s) => s.id === linkedClient?.custom_status_id);
  const clientTags = tags.filter((t) => clientTagIds.includes(t.id));
  const availableTags = tags.filter((t) => !clientTagIds.includes(t.id));

  // If no client is linked, show link button
  if (!clientId || !linkedClient) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-xs text-muted-foreground">Contato não vinculado</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={handleLinkClient}
          disabled={isLinking || !contactPhone}
        >
          <Plus className="h-3 w-3 mr-1" />
          Vincular
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap py-1">
      {/* Status selector */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1"
            style={currentStatus ? { borderColor: currentStatus.color } : undefined}
          >
            <CheckCircle
              className="h-3 w-3"
              style={currentStatus ? { color: currentStatus.color } : undefined}
            />
            {currentStatus?.name || "Status"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => handleStatusChange("none")}
            >
              <span className="text-muted-foreground">Sem status</span>
            </Button>
            {statuses
              .filter((s) => s.is_active)
              .map((status) => (
                <Button
                  key={status.id}
                  variant={currentStatus?.id === status.id ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleStatusChange(status.id)}
                >
                  <span
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: status.color }}
                  />
                  {status.name}
                </Button>
              ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Current tags */}
      {clientTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="h-6 text-xs gap-1 cursor-pointer"
          style={{ backgroundColor: tag.color + "20", color: tag.color }}
          onClick={() => handleRemoveTag(tag.id)}
        >
          {tag.name}
          <X className="h-2 w-2" />
        </Badge>
      ))}

      {/* Add tag button */}
      {availableTags.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <TagIcon className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {availableTags.map((tag) => (
                <Button
                  key={tag.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleAddTag(tag.id)}
                >
                  <span
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
