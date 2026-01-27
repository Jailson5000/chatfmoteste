import { useState, useMemo, useCallback } from "react";
import { ConversationFilters, MappedConversation, ConversationTab } from "../types";

interface UseConversationsFiltersProps {
  mappedConversations: MappedConversation[];
  userId: string | undefined;
}

const initialFilters: ConversationFilters = {
  statuses: [],
  handlers: [],
  tags: [],
  departments: [],
  searchName: '',
  searchPhone: '',
};

export function useConversationsFilters({ mappedConversations, userId }: UseConversationsFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ConversationTab>("queue");
  const [filters, setFilters] = useState<ConversationFilters>(initialFilters);

  // Toggle functions
  const toggleStatusFilter = useCallback((statusId: string) => {
    setFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(statusId)
        ? prev.statuses.filter(s => s !== statusId)
        : [...prev.statuses, statusId]
    }));
  }, []);

  const toggleHandlerFilter = useCallback((handler: 'ai' | 'human' | 'unassigned') => {
    setFilters(prev => ({
      ...prev,
      handlers: prev.handlers.includes(handler)
        ? prev.handlers.filter(h => h !== handler)
        : [...prev.handlers, handler]
    }));
  }, []);

  const toggleTagFilter = useCallback((tagId: string) => {
    setFilters(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter(t => t !== tagId)
        : [...prev.tags, tagId]
    }));
  }, []);

  const toggleDepartmentFilter = useCallback((deptId: string) => {
    setFilters(prev => ({
      ...prev,
      departments: prev.departments.includes(deptId)
        ? prev.departments.filter(d => d !== deptId)
        : [...prev.departments, deptId]
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery('');
  }, []);

  const activeFiltersCount = useMemo(() => 
    filters.statuses.length + 
    filters.handlers.length + 
    filters.tags.length +
    filters.departments.length,
    [filters]
  );

  // Filter conversations by tab and filters
  const filteredConversations = useMemo(() => {
    return mappedConversations.filter((conv) => {
      // Search filter (name or phone)
      const matchesSearch = searchQuery === '' || 
        conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.phone.includes(searchQuery);
      
      if (!matchesSearch) return false;

      // Handler filter (including unassigned)
      if (filters.handlers.length > 0) {
        const matchesHandler = filters.handlers.includes(conv.handler);
        if (!matchesHandler) return false;
      }

      // Status filter
      if (filters.statuses.length > 0) {
        if (!conv.clientStatus?.id || !filters.statuses.includes(conv.clientStatus.id)) {
          return false;
        }
      }

      // Tags filter
      if (filters.tags.length > 0) {
        const hasMatchingTag = conv.tags.some(t => filters.tags.includes(t.name));
        if (!hasMatchingTag) return false;
      }

      // Department filter
      if (filters.departments.length > 0) {
        if (!conv.department?.id || !filters.departments.includes(conv.department.id)) {
          return false;
        }
      }

      // Tab filter - use archivedAt to determine archived status
      const isArchived = !!conv.archivedAt;
      switch (activeTab) {
        case "chat":
          // "Chat": Only show conversations assigned to current user (as human handler), exclude archived
          return !isArchived && conv.handler === "human" && !!userId && conv.assignedUserId === userId;
        case "ai":
          // Exclude archived from AI tab
          return !isArchived && conv.handler === "ai";
        case "queue":
          // "Fila": Only show unassigned conversations (pending - without responsible)
          return !isArchived && (conv.handler === "unassigned" || (conv.handler === "human" && !conv.assignedUserId));
        case "all":
          // "Todos": Show all non-archived conversations
          return !isArchived;
        case "archived":
          // Only show archived conversations
          return isArchived;
        default:
          return true;
      }
    });
  }, [mappedConversations, filters, searchQuery, activeTab, userId]);

  return {
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    toggleStatusFilter,
    toggleHandlerFilter,
    toggleTagFilter,
    toggleDepartmentFilter,
    clearAllFilters,
    activeFiltersCount,
    filteredConversations,
  };
}
