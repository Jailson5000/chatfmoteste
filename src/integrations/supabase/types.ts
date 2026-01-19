export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_notification_logs: {
        Row: {
          company_name: string | null
          created_at: string
          email_sent_to: string
          event_key: string
          event_type: string
          id: string
          metadata: Json | null
          sent_at: string
          tenant_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email_sent_to: string
          event_key: string
          event_type: string
          id?: string
          metadata?: Json | null
          sent_at?: string
          tenant_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email_sent_to?: string
          event_key?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          sent_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notification_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_usage_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      admin_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          user_id?: string
        }
        Relationships: []
      }
      agent_folders: {
        Row: {
          color: string
          created_at: string
          id: string
          law_firm_id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          law_firm_id: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          law_firm_id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_folders_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          knowledge_item_id: string
          law_firm_id: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          knowledge_item_id: string
          law_firm_id: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          knowledge_item_id?: string
          law_firm_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_knowledge_item_id_fkey"
            columns: ["knowledge_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_knowledge_law_firm"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_templates: {
        Row: {
          ai_prompt: string
          ai_temperature: number | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean
          is_featured: boolean | null
          name: string
          response_delay_seconds: number | null
          tags: string[] | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          usage_count: number | null
          voice_enabled: boolean | null
          voice_id: string | null
        }
        Insert: {
          ai_prompt: string
          ai_temperature?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean | null
          name: string
          response_delay_seconds?: number | null
          tags?: string[] | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          usage_count?: number | null
          voice_enabled?: boolean | null
          voice_id?: string | null
        }
        Update: {
          ai_prompt?: string
          ai_temperature?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean | null
          name?: string
          response_delay_seconds?: number | null
          tags?: string[] | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          usage_count?: number | null
          voice_enabled?: boolean | null
          voice_id?: string | null
        }
        Relationships: []
      }
      ai_processing_queue: {
        Row: {
          completed_at: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          first_message_at: string
          id: string
          last_message_at: string
          law_firm_id: string
          message_count: number
          messages: Json
          metadata: Json | null
          process_after: string
          processing_started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          first_message_at?: string
          id?: string
          last_message_at?: string
          law_firm_id: string
          message_count?: number
          messages?: Json
          metadata?: Json | null
          process_after: string
          processing_started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          first_message_at?: string
          id?: string
          last_message_at?: string
          law_firm_id?: string
          message_count?: number
          messages?: Json
          metadata?: Json | null
          process_after?: string
          processing_started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_processing_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_processing_queue_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_template_base: {
        Row: {
          ai_capabilities: Json | null
          ai_prompt: string | null
          ai_provider: string
          ai_temperature: number | null
          created_at: string
          created_by: string | null
          default_automation_description: string | null
          default_automation_name: string | null
          default_automation_trigger_config: Json | null
          default_automation_trigger_type: string | null
          default_departments: Json | null
          default_statuses: Json | null
          default_tags: Json | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          response_delay_seconds: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          ai_capabilities?: Json | null
          ai_prompt?: string | null
          ai_provider?: string
          ai_temperature?: number | null
          created_at?: string
          created_by?: string | null
          default_automation_description?: string | null
          default_automation_name?: string | null
          default_automation_trigger_config?: Json | null
          default_automation_trigger_type?: string | null
          default_departments?: Json | null
          default_statuses?: Json | null
          default_tags?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          response_delay_seconds?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          ai_capabilities?: Json | null
          ai_prompt?: string | null
          ai_provider?: string
          ai_temperature?: number | null
          created_at?: string
          created_by?: string | null
          default_automation_description?: string | null
          default_automation_name?: string | null
          default_automation_trigger_config?: Json | null
          default_automation_trigger_type?: string | null
          default_departments?: Json | null
          default_statuses?: Json | null
          default_tags?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          response_delay_seconds?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      ai_template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          knowledge_items_snapshot: Json | null
          notes: string | null
          template_id: string
          template_snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          knowledge_items_snapshot?: Json | null
          notes?: string | null
          template_id: string
          template_snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          knowledge_items_snapshot?: Json | null
          notes?: string | null
          template_id?: string
          template_snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_template_base"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_transfer_logs: {
        Row: {
          conversation_id: string
          created_at: string
          from_agent_id: string | null
          from_agent_name: string | null
          id: string
          law_firm_id: string
          metadata: Json | null
          reason: string | null
          to_agent_id: string
          to_agent_name: string
          transfer_type: string
          transferred_at: string
          transferred_by: string | null
          transferred_by_name: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_agent_id?: string | null
          from_agent_name?: string | null
          id?: string
          law_firm_id: string
          metadata?: Json | null
          reason?: string | null
          to_agent_id: string
          to_agent_name: string
          transfer_type?: string
          transferred_at?: string
          transferred_by?: string | null
          transferred_by_name?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_agent_id?: string | null
          from_agent_name?: string | null
          id?: string
          law_firm_id?: string
          metadata?: Json | null
          reason?: string | null
          to_agent_id?: string
          to_agent_name?: string
          transfer_type?: string
          transferred_at?: string
          transferred_by?: string | null
          transferred_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_transfer_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_transfer_logs_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          confirmation_sent_at: string | null
          confirmed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          end_time: string
          google_event_id: string | null
          id: string
          is_return: boolean | null
          law_firm_id: string
          notes: string | null
          original_appointment_id: string | null
          pre_message_sent_at: string | null
          professional_id: string | null
          reminder_sent_at: string | null
          service_id: string
          start_time: string
          status: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          confirmation_sent_at?: string | null
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          end_time: string
          google_event_id?: string | null
          id?: string
          is_return?: boolean | null
          law_firm_id: string
          notes?: string | null
          original_appointment_id?: string | null
          pre_message_sent_at?: string | null
          professional_id?: string | null
          reminder_sent_at?: string | null
          service_id: string
          start_time: string
          status?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          confirmation_sent_at?: string | null
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          end_time?: string
          google_event_id?: string | null
          id?: string
          is_return?: boolean | null
          law_firm_id?: string
          notes?: string | null
          original_appointment_id?: string | null
          pre_message_sent_at?: string | null
          professional_id?: string | null
          reminder_sent_at?: string | null
          service_id?: string
          start_time?: string
          status?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_original_appointment_id_fkey"
            columns: ["original_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      automations: {
        Row: {
          ai_prompt: string | null
          ai_temperature: number | null
          created_at: string
          description: string | null
          folder_id: string | null
          id: string
          is_active: boolean
          last_prompt: string | null
          law_firm_id: string
          name: string
          notify_on_transfer: boolean
          position: number
          scheduling_enabled: boolean | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          version: number
          webhook_url: string
        }
        Insert: {
          ai_prompt?: string | null
          ai_temperature?: number | null
          created_at?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          is_active?: boolean
          last_prompt?: string | null
          law_firm_id: string
          name: string
          notify_on_transfer?: boolean
          position?: number
          scheduling_enabled?: boolean | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
          version?: number
          webhook_url: string
        }
        Update: {
          ai_prompt?: string | null
          ai_temperature?: number | null
          created_at?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          is_active?: boolean
          last_prompt?: string | null
          law_firm_id?: string
          name?: string
          notify_on_transfer?: boolean
          position?: number
          scheduling_enabled?: boolean | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          version?: number
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "agent_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_settings: {
        Row: {
          coupon_discount_percent: number | null
          created_at: string
          enabled: boolean | null
          id: string
          include_coupon: boolean | null
          law_firm_id: string
          message_template: string | null
          send_time: string | null
          updated_at: string
        }
        Insert: {
          coupon_discount_percent?: number | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          include_coupon?: boolean | null
          law_firm_id: string
          message_template?: string | null
          send_time?: string | null
          updated_at?: string
        }
        Update: {
          coupon_discount_percent?: number | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          include_coupon?: boolean | null
          law_firm_id?: string
          message_template?: string | null
          send_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "birthday_settings_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: true
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          ai_summary: string | null
          assigned_to: string | null
          case_number: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          id: string
          law_firm_id: string
          legal_area: Database["public"]["Enums"]["legal_area"]
          priority: number
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          case_number?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          law_firm_id: string
          legal_area?: Database["public"]["Enums"]["legal_area"]
          priority?: number
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          case_number?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          law_firm_id?: string
          legal_area?: Database["public"]["Enums"]["legal_area"]
          priority?: number
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      client_actions: {
        Row: {
          action_type: string
          client_id: string
          created_at: string
          description: string | null
          from_value: string | null
          id: string
          law_firm_id: string
          performed_by: string | null
          to_value: string | null
        }
        Insert: {
          action_type: string
          client_id: string
          created_at?: string
          description?: string | null
          from_value?: string | null
          id?: string
          law_firm_id: string
          performed_by?: string | null
          to_value?: string | null
        }
        Update: {
          action_type?: string
          client_id?: string
          created_at?: string
          description?: string | null
          from_value?: string | null
          id?: string
          law_firm_id?: string
          performed_by?: string | null
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_actions_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memories: {
        Row: {
          client_id: string
          content: string
          created_at: string
          fact_type: string
          id: string
          importance: number | null
          is_active: boolean | null
          law_firm_id: string
          source_conversation_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          fact_type: string
          id?: string
          importance?: number | null
          is_active?: boolean | null
          law_firm_id: string
          source_conversation_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          fact_type?: string
          id?: string
          importance?: number | null
          is_active?: boolean | null
          law_firm_id?: string
          source_conversation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memories_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memories_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          client_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          assigned_to: string | null
          avatar_url: string | null
          birth_date: string | null
          birthday_message_enabled: boolean | null
          created_at: string
          custom_status_id: string | null
          department_id: string | null
          document: string | null
          email: string | null
          id: string
          is_agenda_client: boolean | null
          last_whatsapp_instance_id: string | null
          law_firm_id: string
          lgpd_consent: boolean
          lgpd_consent_date: string | null
          name: string
          notes: string | null
          phone: string
          state: string | null
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          birthday_message_enabled?: boolean | null
          created_at?: string
          custom_status_id?: string | null
          department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_agenda_client?: boolean | null
          last_whatsapp_instance_id?: string | null
          law_firm_id: string
          lgpd_consent?: boolean
          lgpd_consent_date?: string | null
          name: string
          notes?: string | null
          phone: string
          state?: string | null
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          birthday_message_enabled?: boolean | null
          created_at?: string
          custom_status_id?: string | null
          department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_agenda_client?: boolean | null
          last_whatsapp_instance_id?: string | null
          law_firm_id?: string
          lgpd_consent?: boolean
          lgpd_consent_date?: string | null
          name?: string
          notes?: string | null
          phone?: string
          state?: string | null
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_to_profile_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_custom_status_id_fkey"
            columns: ["custom_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_last_whatsapp_instance_id_fkey"
            columns: ["last_whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          admin_user_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          client_app_status: string
          created_at: string
          document: string | null
          email: string | null
          health_status: string | null
          id: string
          initial_access_email_error: string | null
          initial_access_email_sent: boolean | null
          initial_access_email_sent_at: string | null
          last_health_check_at: string | null
          law_firm_id: string | null
          max_agents: number | null
          max_ai_conversations: number | null
          max_instances: number | null
          max_tts_minutes: number | null
          max_users: number | null
          max_workspaces: number | null
          n8n_created_at: string | null
          n8n_last_error: string | null
          n8n_next_retry_at: string | null
          n8n_retry_count: number
          n8n_updated_at: string | null
          n8n_workflow_id: string | null
          n8n_workflow_name: string | null
          n8n_workflow_status: string | null
          name: string
          phone: string | null
          plan_id: string | null
          provisioning_status: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          template_cloned_at: string | null
          template_version: number | null
          trial_ends_at: string | null
          updated_at: string
          use_custom_limits: boolean
        }
        Insert: {
          admin_user_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_app_status?: string
          created_at?: string
          document?: string | null
          email?: string | null
          health_status?: string | null
          id?: string
          initial_access_email_error?: string | null
          initial_access_email_sent?: boolean | null
          initial_access_email_sent_at?: string | null
          last_health_check_at?: string | null
          law_firm_id?: string | null
          max_agents?: number | null
          max_ai_conversations?: number | null
          max_instances?: number | null
          max_tts_minutes?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          n8n_created_at?: string | null
          n8n_last_error?: string | null
          n8n_next_retry_at?: string | null
          n8n_retry_count?: number
          n8n_updated_at?: string | null
          n8n_workflow_id?: string | null
          n8n_workflow_name?: string | null
          n8n_workflow_status?: string | null
          name: string
          phone?: string | null
          plan_id?: string | null
          provisioning_status?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          template_cloned_at?: string | null
          template_version?: number | null
          trial_ends_at?: string | null
          updated_at?: string
          use_custom_limits?: boolean
        }
        Update: {
          admin_user_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_app_status?: string
          created_at?: string
          document?: string | null
          email?: string | null
          health_status?: string | null
          id?: string
          initial_access_email_error?: string | null
          initial_access_email_sent?: boolean | null
          initial_access_email_sent_at?: string | null
          last_health_check_at?: string | null
          law_firm_id?: string | null
          max_agents?: number | null
          max_ai_conversations?: number | null
          max_instances?: number | null
          max_tts_minutes?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          n8n_created_at?: string | null
          n8n_last_error?: string | null
          n8n_next_retry_at?: string | null
          n8n_retry_count?: number
          n8n_updated_at?: string | null
          n8n_workflow_id?: string | null
          n8n_workflow_name?: string | null
          n8n_workflow_status?: string | null
          name?: string
          phone?: string | null
          plan_id?: string | null
          provisioning_status?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          template_cloned_at?: string | null
          template_version?: number | null
          trial_ends_at?: string | null
          updated_at?: string
          use_custom_limits?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "companies_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          client_id: string
          consent_type: string
          created_at: string
          granted: boolean
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          client_id: string
          consent_type: string
          created_at?: string
          granted: boolean
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          consent_type?: string
          created_at?: string
          granted?: boolean
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_audio_enabled: boolean | null
          ai_audio_enabled_by: string | null
          ai_audio_last_disabled_at: string | null
          ai_audio_last_enabled_at: string | null
          ai_summary: string | null
          archived_at: string | null
          archived_next_responsible_id: string | null
          archived_next_responsible_type: string | null
          archived_reason: string | null
          assigned_to: string | null
          client_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          current_automation_id: string | null
          current_handler: Database["public"]["Enums"]["message_handler"]
          department_id: string | null
          id: string
          internal_notes: string | null
          last_message_at: string | null
          last_summarized_at: string | null
          last_whatsapp_instance_id: string | null
          law_firm_id: string
          n8n_last_response_at: string | null
          needs_human_handoff: boolean | null
          origin: string | null
          origin_metadata: Json | null
          priority: number
          remote_jid: string
          status: Database["public"]["Enums"]["case_status"]
          summary_message_count: number | null
          tags: string[] | null
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          ai_audio_enabled?: boolean | null
          ai_audio_enabled_by?: string | null
          ai_audio_last_disabled_at?: string | null
          ai_audio_last_enabled_at?: string | null
          ai_summary?: string | null
          archived_at?: string | null
          archived_next_responsible_id?: string | null
          archived_next_responsible_type?: string | null
          archived_reason?: string | null
          assigned_to?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          current_automation_id?: string | null
          current_handler?: Database["public"]["Enums"]["message_handler"]
          department_id?: string | null
          id?: string
          internal_notes?: string | null
          last_message_at?: string | null
          last_summarized_at?: string | null
          last_whatsapp_instance_id?: string | null
          law_firm_id: string
          n8n_last_response_at?: string | null
          needs_human_handoff?: boolean | null
          origin?: string | null
          origin_metadata?: Json | null
          priority?: number
          remote_jid: string
          status?: Database["public"]["Enums"]["case_status"]
          summary_message_count?: number | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          ai_audio_enabled?: boolean | null
          ai_audio_enabled_by?: string | null
          ai_audio_last_disabled_at?: string | null
          ai_audio_last_enabled_at?: string | null
          ai_summary?: string | null
          archived_at?: string | null
          archived_next_responsible_id?: string | null
          archived_next_responsible_type?: string | null
          archived_reason?: string | null
          assigned_to?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          current_automation_id?: string | null
          current_handler?: Database["public"]["Enums"]["message_handler"]
          department_id?: string | null
          id?: string
          internal_notes?: string | null
          last_message_at?: string | null
          last_summarized_at?: string | null
          last_whatsapp_instance_id?: string | null
          law_firm_id?: string
          n8n_last_response_at?: string | null
          needs_human_handoff?: boolean | null
          origin?: string | null
          origin_metadata?: Json | null
          priority?: number
          remote_jid?: string
          status?: Database["public"]["Enums"]["case_status"]
          summary_message_count?: number | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_current_automation_id_fkey"
            columns: ["current_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_whatsapp_instance_id_fkey"
            columns: ["last_whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversations_current_automation"
            columns: ["current_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_statuses: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          law_firm_id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          law_firm_id: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          law_firm_id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_statuses_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          law_firm_id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          law_firm_id: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          law_firm_id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          uploaded_by: string | null
        }
        Insert: {
          case_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_api_connections: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          description: string | null
          health_latency_ms: number | null
          health_status: string | null
          id: string
          is_active: boolean
          is_default: boolean
          last_health_check_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          description?: string | null
          health_latency_ms?: number | null
          health_status?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_health_check_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          description?: string | null
          health_latency_ms?: number | null
          health_status?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_health_check_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_calendar_ai_logs: {
        Row: {
          action_type: string
          ai_agent_id: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          event_end: string | null
          event_id: string | null
          event_start: string | null
          event_title: string | null
          id: string
          integration_id: string
          ip_address: string | null
          law_firm_id: string
          performed_by: string
          request_description: string | null
          response_summary: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          action_type: string
          ai_agent_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_end?: string | null
          event_id?: string | null
          event_start?: string | null
          event_title?: string | null
          id?: string
          integration_id: string
          ip_address?: string | null
          law_firm_id: string
          performed_by?: string
          request_description?: string | null
          response_summary?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          ai_agent_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_end?: string | null
          event_id?: string | null
          event_start?: string | null
          event_title?: string | null
          id?: string
          integration_id?: string
          ip_address?: string | null
          law_firm_id?: string
          performed_by?: string
          request_description?: string | null
          response_summary?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_ai_logs_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_ai_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_ai_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_ai_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_integration_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_ai_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_ai_logs_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_events: {
        Row: {
          attendees: Json | null
          calendar_id: string
          client_id: string | null
          conversation_id: string | null
          created_at: string
          created_by_ai: boolean | null
          description: string | null
          end_time: string
          etag: string | null
          google_event_id: string
          html_link: string | null
          id: string
          integration_id: string
          is_all_day: boolean | null
          last_synced_at: string | null
          law_firm_id: string
          location: string | null
          meet_link: string | null
          recurrence_rule: string | null
          recurring_event_id: string | null
          start_time: string
          status: string | null
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: Json | null
          calendar_id: string
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_ai?: boolean | null
          description?: string | null
          end_time: string
          etag?: string | null
          google_event_id: string
          html_link?: string | null
          id?: string
          integration_id: string
          is_all_day?: boolean | null
          last_synced_at?: string | null
          law_firm_id: string
          location?: string | null
          meet_link?: string | null
          recurrence_rule?: string | null
          recurring_event_id?: string | null
          start_time: string
          status?: string | null
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: Json | null
          calendar_id?: string
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_ai?: boolean | null
          description?: string | null
          end_time?: string
          etag?: string | null
          google_event_id?: string
          html_link?: string | null
          id?: string
          integration_id?: string
          is_all_day?: boolean | null
          last_synced_at?: string | null
          law_firm_id?: string
          location?: string | null
          meet_link?: string | null
          recurrence_rule?: string | null
          recurring_event_id?: string | null
          start_time?: string
          status?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_integration_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_integrations: {
        Row: {
          access_token: string
          allow_create_events: boolean
          allow_delete_events: boolean
          allow_edit_events: boolean
          allow_read_events: boolean
          connected_at: string
          connected_by: string | null
          created_at: string
          default_calendar_id: string | null
          default_calendar_name: string | null
          google_account_id: string | null
          google_email: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          law_firm_id: string
          next_sync_at: string | null
          refresh_token: string
          sync_token: string | null
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          allow_create_events?: boolean
          allow_delete_events?: boolean
          allow_edit_events?: boolean
          allow_read_events?: boolean
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          default_calendar_id?: string | null
          default_calendar_name?: string | null
          google_account_id?: string | null
          google_email: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          law_firm_id: string
          next_sync_at?: string | null
          refresh_token: string
          sync_token?: string | null
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          allow_create_events?: boolean
          allow_delete_events?: boolean
          allow_edit_events?: boolean
          allow_read_events?: boolean
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          default_calendar_id?: string | null
          default_calendar_name?: string | null
          google_account_id?: string | null
          google_email?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          law_firm_id?: string
          next_sync_at?: string | null
          refresh_token?: string
          sync_token?: string | null
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_integrations_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: true
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_status_history: {
        Row: {
          changed_at: string
          created_at: string
          id: string
          instance_id: string
          previous_status: string | null
          status: string
        }
        Insert: {
          changed_at?: string
          created_at?: string
          id?: string
          instance_id: string
          previous_status?: string | null
          status: string
        }
        Update: {
          changed_at?: string
          created_at?: string
          id?: string
          instance_id?: string
          previous_status?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "instance_status_history_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          color: string
          created_at: string
          id: string
          law_firm_id: string
          name: string
          position: number
          status: Database["public"]["Enums"]["case_status"]
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          law_firm_id: string
          name: string
          position?: number
          status: Database["public"]["Enums"]["case_status"]
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          law_firm_id?: string
          name?: string
          position?: number
          status?: Database["public"]["Enums"]["case_status"]
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          category: string
          content: string | null
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          item_type: string
          law_firm_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          item_type?: string
          law_firm_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          item_type?: string
          law_firm_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_settings: {
        Row: {
          ai_capabilities: Json | null
          ai_provider: string
          ai_settings_updated_at: string | null
          ai_settings_updated_by: string | null
          ai_voice_enabled: boolean | null
          ai_voice_id: string | null
          created_at: string
          default_automation_id: string | null
          evolution_api_key: string | null
          evolution_api_url: string | null
          id: string
          law_firm_id: string
          n8n_last_test_at: string | null
          n8n_last_test_status: string | null
          n8n_webhook_secret: string | null
          n8n_webhook_url: string | null
          openai_api_key: string | null
          openai_last_test_at: string | null
          openai_last_test_status: string | null
          updated_at: string
        }
        Insert: {
          ai_capabilities?: Json | null
          ai_provider?: string
          ai_settings_updated_at?: string | null
          ai_settings_updated_by?: string | null
          ai_voice_enabled?: boolean | null
          ai_voice_id?: string | null
          created_at?: string
          default_automation_id?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          law_firm_id: string
          n8n_last_test_at?: string | null
          n8n_last_test_status?: string | null
          n8n_webhook_secret?: string | null
          n8n_webhook_url?: string | null
          openai_api_key?: string | null
          openai_last_test_at?: string | null
          openai_last_test_status?: string | null
          updated_at?: string
        }
        Update: {
          ai_capabilities?: Json | null
          ai_provider?: string
          ai_settings_updated_at?: string | null
          ai_settings_updated_by?: string | null
          ai_voice_enabled?: boolean | null
          ai_voice_id?: string | null
          created_at?: string
          default_automation_id?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          law_firm_id?: string
          n8n_last_test_at?: string | null
          n8n_last_test_status?: string | null
          n8n_webhook_secret?: string | null
          n8n_webhook_url?: string | null
          openai_api_key?: string | null
          openai_last_test_at?: string | null
          openai_last_test_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_settings_default_automation_id_fkey"
            columns: ["default_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_settings_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: true
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firms: {
        Row: {
          address: string | null
          business_hours: Json | null
          confirmation_hours_before: number | null
          confirmation_message_template: string | null
          created_at: string
          document: string | null
          email: string | null
          facebook: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          oab_number: string | null
          phone: string | null
          phone2: string | null
          reminder_hours_before: number | null
          reminder_message_template: string | null
          subdomain: string | null
          timezone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_hours?: Json | null
          confirmation_hours_before?: number | null
          confirmation_message_template?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          oab_number?: string | null
          phone?: string | null
          phone2?: string | null
          reminder_hours_before?: number | null
          reminder_message_template?: string | null
          subdomain?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_hours?: Json | null
          confirmation_hours_before?: number | null
          confirmation_message_template?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          oab_number?: string | null
          phone?: string | null
          phone2?: string | null
          reminder_hours_before?: number | null
          reminder_message_template?: string | null
          subdomain?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      member_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_departments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_agent_id: string | null
          ai_agent_name: string | null
          ai_generated: boolean
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          id: string
          is_from_me: boolean
          is_internal: boolean
          is_pontual: boolean | null
          is_revoked: boolean | null
          is_starred: boolean | null
          media_mime_type: string | null
          media_url: string | null
          message_type: string
          my_reaction: string | null
          read_at: string | null
          reply_to_message_id: string | null
          revoked_at: string | null
          sender_id: string | null
          sender_type: string
          status: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          ai_agent_name?: string | null
          ai_generated?: boolean
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_from_me?: boolean
          is_internal?: boolean
          is_pontual?: boolean | null
          is_revoked?: boolean | null
          is_starred?: boolean | null
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          my_reaction?: string | null
          read_at?: string | null
          reply_to_message_id?: string | null
          revoked_at?: string | null
          sender_id?: string | null
          sender_type: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          ai_agent_name?: string | null
          ai_generated?: boolean
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_from_me?: boolean
          is_internal?: boolean
          is_pontual?: boolean | null
          is_revoked?: boolean | null
          is_starred?: boolean | null
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          my_reaction?: string | null
          read_at?: string | null
          reply_to_message_id?: string | null
          revoked_at?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          admin_user_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          billing_period: string
          created_at: string
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          max_agents: number | null
          max_ai_conversations: number | null
          max_instances: number | null
          max_messages: number | null
          max_tts_minutes: number | null
          max_users: number | null
          max_workspaces: number | null
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_agents?: number | null
          max_ai_conversations?: number | null
          max_instances?: number | null
          max_messages?: number | null
          max_tts_minutes?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_agents?: number | null
          max_ai_conversations?: number | null
          max_instances?: number | null
          max_messages?: number | null
          max_tts_minutes?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      professional_services: {
        Row: {
          created_at: string
          id: string
          professional_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          professional_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          avatar_url: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean | null
          law_firm_id: string
          name: string
          notes: string | null
          phone: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          law_firm_id: string
          name: string
          notes?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          law_firm_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          law_firm_id: string | null
          must_change_password: boolean
          notification_browser_enabled: boolean
          notification_sound_enabled: boolean
          oab_number: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          job_title?: string | null
          law_firm_id?: string | null
          must_change_password?: boolean
          notification_browser_enabled?: boolean
          notification_sound_enabled?: boolean
          oab_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          law_firm_id?: string | null
          must_change_password?: boolean
          notification_browser_enabled?: boolean
          notification_sound_enabled?: boolean
          oab_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_follow_ups: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          client_id: string
          conversation_id: string
          created_at: string
          error_message: string | null
          follow_up_rule_id: string
          id: string
          law_firm_id: string
          scheduled_at: string
          sent_at: string | null
          started_at: string | null
          status: string
          template_id: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id: string
          conversation_id: string
          created_at?: string
          error_message?: string | null
          follow_up_rule_id: string
          id?: string
          law_firm_id: string
          scheduled_at: string
          sent_at?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id?: string
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          follow_up_rule_id?: string
          id?: string
          law_firm_id?: string
          scheduled_at?: string
          sent_at?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_follow_ups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_follow_up_rule_id_fkey"
            columns: ["follow_up_rule_id"]
            isOneToOne: false
            referencedRelation: "status_follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_after_minutes: number
          buffer_before_minutes: number
          color: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          law_firm_id: string
          name: string
          position: number
          pre_message_enabled: boolean | null
          pre_message_hours_before: number | null
          pre_message_text: string | null
          price: number | null
          return_enabled: boolean | null
          return_interval_days: number | null
          updated_at: string
        }
        Insert: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          color?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          law_firm_id: string
          name: string
          position?: number
          pre_message_enabled?: boolean | null
          pre_message_hours_before?: number | null
          pre_message_text?: string | null
          price?: number | null
          return_enabled?: boolean | null
          return_interval_days?: number | null
          updated_at?: string
        }
        Update: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          color?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          law_firm_id?: string
          name?: string
          position?: number
          pre_message_enabled?: boolean | null
          pre_message_hours_before?: number | null
          pre_message_text?: string | null
          price?: number | null
          return_enabled?: boolean | null
          return_interval_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      status_follow_ups: {
        Row: {
          created_at: string
          delay_minutes: number
          delay_unit: string
          give_up_on_no_response: boolean
          give_up_status_id: string | null
          id: string
          is_active: boolean
          law_firm_id: string
          position: number
          status_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delay_unit?: string
          give_up_on_no_response?: boolean
          give_up_status_id?: string | null
          id?: string
          is_active?: boolean
          law_firm_id: string
          position?: number
          status_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delay_unit?: string
          give_up_on_no_response?: boolean
          give_up_status_id?: string | null
          id?: string
          is_active?: boolean
          law_firm_id?: string
          position?: number
          status_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_follow_ups_give_up_status_id_fkey"
            columns: ["give_up_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_follow_ups_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_follow_ups_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_follow_ups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          id: string
          metric_name: string
          metric_type: string
          metric_value: number
          recorded_at: string
          tags: Json | null
        }
        Insert: {
          id?: string
          metric_name: string
          metric_type?: string
          metric_value: number
          recorded_at?: string
          tags?: Json | null
        }
        Update: {
          id?: string
          metric_name?: string
          metric_type?: string
          metric_value?: number
          recorded_at?: string
          tags?: Json | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          law_firm_id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          law_firm_id: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          law_firm_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      template_knowledge_items: {
        Row: {
          category: string
          content: string | null
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean
          item_type: string
          position: number | null
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          item_type?: string
          position?: number | null
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          item_type?: string
          position?: number | null
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_knowledge_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_template_base"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          law_firm_id: string
          media_type: string | null
          media_url: string | null
          name: string
          shortcut: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          law_firm_id: string
          media_type?: string | null
          media_url?: string | null
          name: string
          shortcut: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          law_firm_id?: string
          media_type?: string | null
          media_url?: string | null
          name?: string
          shortcut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_chat_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          integration_id: string
          law_firm_id: string
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          integration_id: string
          law_firm_id: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          integration_id?: string
          law_firm_id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tray_chat_audit_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "tray_chat_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_chat_audit_logs_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_chat_integrations: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          default_automation_id: string | null
          default_department_id: string | null
          default_handler_type: string | null
          default_human_agent_id: string | null
          default_status_id: string | null
          first_use_at: string | null
          id: string
          is_active: boolean
          law_firm_id: string
          offline_message: string | null
          updated_at: string
          welcome_message: string | null
          widget_color: string | null
          widget_key: string
          widget_position: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          default_automation_id?: string | null
          default_department_id?: string | null
          default_handler_type?: string | null
          default_human_agent_id?: string | null
          default_status_id?: string | null
          first_use_at?: string | null
          id?: string
          is_active?: boolean
          law_firm_id: string
          offline_message?: string | null
          updated_at?: string
          welcome_message?: string | null
          widget_color?: string | null
          widget_key: string
          widget_position?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          default_automation_id?: string | null
          default_department_id?: string | null
          default_handler_type?: string | null
          default_human_agent_id?: string | null
          default_status_id?: string | null
          first_use_at?: string | null
          id?: string
          is_active?: boolean
          law_firm_id?: string
          offline_message?: string | null
          updated_at?: string
          welcome_message?: string | null
          widget_color?: string | null
          widget_key?: string
          widget_position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tray_chat_integrations_default_automation_id_fkey"
            columns: ["default_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_chat_integrations_default_department_id_fkey"
            columns: ["default_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_chat_integrations_default_human_agent_id_fkey"
            columns: ["default_human_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_chat_integrations_default_status_id_fkey"
            columns: ["default_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_chat_integrations_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: true
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_commerce_audit_logs: {
        Row: {
          action: string
          connection_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          law_firm_id: string
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          connection_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          law_firm_id: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          connection_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          law_firm_id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tray_commerce_audit_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_commerce_audit_logs_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_commerce_connections: {
        Row: {
          access_token: string | null
          api_address: string | null
          connected_at: string | null
          connected_by: string | null
          connection_status: string
          consumer_key: string | null
          consumer_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          last_error: string | null
          law_firm_id: string
          read_only_mode: boolean
          refresh_token: string | null
          store_name: string
          store_url: string
          sync_coupons: boolean
          sync_customers: boolean
          sync_orders: boolean
          sync_products: boolean
          sync_shipping: boolean
          token_expires_at: string | null
          tray_store_id: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          api_address?: string | null
          connected_at?: string | null
          connected_by?: string | null
          connection_status?: string
          consumer_key?: string | null
          consumer_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_error?: string | null
          law_firm_id: string
          read_only_mode?: boolean
          refresh_token?: string | null
          store_name: string
          store_url: string
          sync_coupons?: boolean
          sync_customers?: boolean
          sync_orders?: boolean
          sync_products?: boolean
          sync_shipping?: boolean
          token_expires_at?: string | null
          tray_store_id?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          api_address?: string | null
          connected_at?: string | null
          connected_by?: string | null
          connection_status?: string
          consumer_key?: string | null
          consumer_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_error?: string | null
          law_firm_id?: string
          read_only_mode?: boolean
          refresh_token?: string | null
          store_name?: string
          store_url?: string
          sync_coupons?: boolean
          sync_customers?: boolean
          sync_orders?: boolean
          sync_products?: boolean
          sync_shipping?: boolean
          token_expires_at?: string | null
          tray_store_id?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tray_commerce_connections_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_commerce_sync_state: {
        Row: {
          connection_id: string
          coupons_synced_count: number | null
          created_at: string
          customers_synced_count: number | null
          id: string
          last_coupons_sync_at: string | null
          last_customers_sync_at: string | null
          last_orders_sync_at: string | null
          last_products_sync_at: string | null
          last_shipping_sync_at: string | null
          last_sync_error: string | null
          last_webhook_at: string | null
          orders_synced_count: number | null
          products_synced_count: number | null
          sync_in_progress: boolean | null
          sync_started_at: string | null
          updated_at: string
        }
        Insert: {
          connection_id: string
          coupons_synced_count?: number | null
          created_at?: string
          customers_synced_count?: number | null
          id?: string
          last_coupons_sync_at?: string | null
          last_customers_sync_at?: string | null
          last_orders_sync_at?: string | null
          last_products_sync_at?: string | null
          last_shipping_sync_at?: string | null
          last_sync_error?: string | null
          last_webhook_at?: string | null
          orders_synced_count?: number | null
          products_synced_count?: number | null
          sync_in_progress?: boolean | null
          sync_started_at?: string | null
          updated_at?: string
        }
        Update: {
          connection_id?: string
          coupons_synced_count?: number | null
          created_at?: string
          customers_synced_count?: number | null
          id?: string
          last_coupons_sync_at?: string | null
          last_customers_sync_at?: string | null
          last_orders_sync_at?: string | null
          last_products_sync_at?: string | null
          last_shipping_sync_at?: string | null
          last_sync_error?: string | null
          last_webhook_at?: string | null
          orders_synced_count?: number | null
          products_synced_count?: number | null
          sync_in_progress?: boolean | null
          sync_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tray_commerce_sync_state_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_commerce_webhook_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          event_type: string
          id: string
          law_firm_id: string | null
          payload_summary: Json | null
          processed: boolean | null
          processed_at: string | null
          raw_payload: Json | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          law_firm_id?: string | null
          payload_summary?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          law_firm_id?: string | null
          payload_summary?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tray_commerce_webhook_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_commerce_webhook_logs_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_coupon_map: {
        Row: {
          code: string | null
          connection_id: string
          created_at: string
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          local_coupon_id: string | null
          max_uses: number | null
          min_value: number | null
          starts_at: string | null
          tray_coupon_data: Json | null
          tray_coupon_id: string
          updated_at: string
          uses_count: number | null
        }
        Insert: {
          code?: string | null
          connection_id: string
          created_at?: string
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          local_coupon_id?: string | null
          max_uses?: number | null
          min_value?: number | null
          starts_at?: string | null
          tray_coupon_data?: Json | null
          tray_coupon_id: string
          updated_at?: string
          uses_count?: number | null
        }
        Update: {
          code?: string | null
          connection_id?: string
          created_at?: string
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          local_coupon_id?: string | null
          max_uses?: number | null
          min_value?: number | null
          starts_at?: string | null
          tray_coupon_data?: Json | null
          tray_coupon_id?: string
          updated_at?: string
          uses_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tray_coupon_map_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_customer_map: {
        Row: {
          connection_id: string
          created_at: string
          document: string | null
          email: string | null
          id: string
          last_synced_at: string | null
          local_client_id: string | null
          name: string | null
          phone: string | null
          tray_customer_data: Json | null
          tray_customer_id: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          last_synced_at?: string | null
          local_client_id?: string | null
          name?: string | null
          phone?: string | null
          tray_customer_data?: Json | null
          tray_customer_id: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          last_synced_at?: string | null
          local_client_id?: string | null
          name?: string | null
          phone?: string | null
          tray_customer_data?: Json | null
          tray_customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tray_customer_map_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_customer_map_local_client_id_fkey"
            columns: ["local_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_order_map: {
        Row: {
          connection_id: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          id: string
          items: Json | null
          last_synced_at: string | null
          local_conversation_id: string | null
          local_status: string | null
          order_date: string | null
          order_number: string | null
          payment_method: string | null
          shipping_address: Json | null
          shipping_method: string | null
          shipping_value: number | null
          subtotal: number | null
          total: number | null
          tracking_code: string | null
          tracking_url: string | null
          tray_order_data: Json | null
          tray_order_id: string
          tray_status: string | null
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          last_synced_at?: string | null
          local_conversation_id?: string | null
          local_status?: string | null
          order_date?: string | null
          order_number?: string | null
          payment_method?: string | null
          shipping_address?: Json | null
          shipping_method?: string | null
          shipping_value?: number | null
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          tray_order_data?: Json | null
          tray_order_id: string
          tray_status?: string | null
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          last_synced_at?: string | null
          local_conversation_id?: string | null
          local_status?: string | null
          order_date?: string | null
          order_number?: string | null
          payment_method?: string | null
          shipping_address?: Json | null
          shipping_method?: string | null
          shipping_value?: number | null
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          tray_order_data?: Json | null
          tray_order_id?: string
          tray_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tray_order_map_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tray_order_map_local_conversation_id_fkey"
            columns: ["local_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      tray_product_map: {
        Row: {
          connection_id: string
          created_at: string
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          local_product_id: string | null
          name: string | null
          price: number | null
          sku: string | null
          stock: number | null
          tray_product_data: Json | null
          tray_product_id: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          local_product_id?: string | null
          name?: string | null
          price?: number | null
          sku?: string | null
          stock?: number | null
          tray_product_data?: Json | null
          tray_product_id: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          local_product_id?: string | null
          name?: string | null
          price?: number | null
          sku?: string | null
          stock?: number | null
          tray_product_data?: Json | null
          tray_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tray_product_map_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "tray_commerce_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_history_monthly: {
        Row: {
          ai_conversations: number | null
          billing_period: string
          closed_at: string | null
          created_at: string | null
          id: string
          law_firm_id: string
          max_agents_snapshot: number | null
          max_instances_snapshot: number | null
          max_users_snapshot: number | null
          transcriptions: number | null
          tts_minutes: number | null
        }
        Insert: {
          ai_conversations?: number | null
          billing_period: string
          closed_at?: string | null
          created_at?: string | null
          id?: string
          law_firm_id: string
          max_agents_snapshot?: number | null
          max_instances_snapshot?: number | null
          max_users_snapshot?: number | null
          transcriptions?: number | null
          tts_minutes?: number | null
        }
        Update: {
          ai_conversations?: number | null
          billing_period?: string
          closed_at?: string | null
          created_at?: string | null
          id?: string
          law_firm_id?: string
          max_agents_snapshot?: number | null
          max_instances_snapshot?: number | null
          max_users_snapshot?: number | null
          transcriptions?: number | null
          tts_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_history_monthly_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          billing_period: string
          count: number
          created_at: string
          duration_seconds: number | null
          id: string
          law_firm_id: string
          metadata: Json | null
          usage_type: string
        }
        Insert: {
          billing_period: string
          count?: number
          created_at?: string
          duration_seconds?: number | null
          id?: string
          law_firm_id: string
          metadata?: Json | null
          usage_type: string
        }
        Update: {
          billing_period?: string
          count?: number
          created_at?: string
          duration_seconds?: number | null
          id?: string
          law_firm_id?: string
          metadata?: Json | null
          usage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          automation_id: string | null
          created_at: string
          direction: string
          error_message: string | null
          id: string
          payload: Json
          response: Json | null
          status_code: number | null
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          direction: string
          error_message?: string | null
          id?: string
          payload: Json
          response?: Json | null
          status_code?: number | null
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          payload?: Json
          response?: Json | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_key: string | null
          api_key_encrypted: boolean | null
          api_url: string
          created_at: string
          default_assigned_to: string | null
          default_automation_id: string | null
          default_department_id: string | null
          default_status_id: string | null
          disconnected_since: string | null
          display_name: string | null
          id: string
          instance_id: string | null
          instance_name: string
          last_alert_sent_at: string | null
          last_webhook_at: string | null
          last_webhook_event: string | null
          law_firm_id: string
          phone_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_key_encrypted?: boolean | null
          api_url: string
          created_at?: string
          default_assigned_to?: string | null
          default_automation_id?: string | null
          default_department_id?: string | null
          default_status_id?: string | null
          disconnected_since?: string | null
          display_name?: string | null
          id?: string
          instance_id?: string | null
          instance_name: string
          last_alert_sent_at?: string | null
          last_webhook_at?: string | null
          last_webhook_event?: string | null
          law_firm_id: string
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_key_encrypted?: boolean | null
          api_url?: string
          created_at?: string
          default_assigned_to?: string | null
          default_automation_id?: string | null
          default_department_id?: string | null
          default_status_id?: string | null
          disconnected_since?: string | null
          display_name?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string
          last_alert_sent_at?: string | null
          last_webhook_at?: string | null
          last_webhook_event?: string | null
          law_firm_id?: string
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_default_assigned_to_fkey"
            columns: ["default_assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_default_automation_id_fkey"
            columns: ["default_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_default_department_id_fkey"
            columns: ["default_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_default_status_id_fkey"
            columns: ["default_status_id"]
            isOneToOne: false
            referencedRelation: "custom_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      company_usage_summary: {
        Row: {
          company_id: string | null
          company_name: string | null
          current_agents: number | null
          current_ai_conversations: number | null
          current_instances: number | null
          current_tts_minutes: number | null
          current_users: number | null
          effective_max_agents: number | null
          effective_max_ai_conversations: number | null
          effective_max_instances: number | null
          effective_max_tts_minutes: number | null
          effective_max_users: number | null
          effective_max_workspaces: number | null
          law_firm_id: string | null
          plan_id: string | null
          plan_name: string | null
          use_custom_limits: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_integration_status: {
        Row: {
          allow_create_events: boolean | null
          allow_delete_events: boolean | null
          allow_edit_events: boolean | null
          allow_read_events: boolean | null
          connected_at: string | null
          default_calendar_id: string | null
          default_calendar_name: string | null
          google_email: string | null
          id: string | null
          is_active: boolean | null
          last_sync_at: string | null
          law_firm_id: string | null
        }
        Insert: {
          allow_create_events?: boolean | null
          allow_delete_events?: boolean | null
          allow_edit_events?: boolean | null
          allow_read_events?: boolean | null
          connected_at?: string | null
          default_calendar_id?: string | null
          default_calendar_name?: string | null
          google_email?: string | null
          id?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          law_firm_id?: string | null
        }
        Update: {
          allow_create_events?: boolean | null
          allow_delete_events?: boolean | null
          allow_edit_events?: boolean | null
          allow_read_events?: boolean | null
          connected_at?: string | null
          default_calendar_id?: string | null
          default_calendar_name?: string | null
          google_email?: string | null
          id?: string | null
          is_active?: boolean | null
          last_sync_at?: string | null
          law_firm_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_integrations_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: true
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_company_limit: {
        Args: { _increment?: number; _law_firm_id: string; _limit_type: string }
        Returns: Json
      }
      clone_template_for_company: {
        Args: { _company_id: string; _law_firm_id: string }
        Returns: Json
      }
      get_admin_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["admin_role"]
      }
      get_conversation_tab_counts: {
        Args: { _law_firm_id: string; _user_id?: string }
        Returns: Json
      }
      get_conversations_with_metadata:
        | { Args: { _law_firm_id: string }; Returns: Json[] }
        | {
            Args: { _law_firm_id: string; _limit?: number; _offset?: number }
            Returns: Json[]
          }
      get_law_firm_by_subdomain: {
        Args: { _subdomain: string }
        Returns: string
      }
      get_user_law_firm_id: { Args: { _user_id: string }; Returns: string }
      has_admin_role: {
        Args: {
          _role: Database["public"]["Enums"]["admin_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_messages_as_read: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: number
      }
      normalize_phone: { Args: { phone: string }; Returns: string }
      reassociate_orphan_records: {
        Args: { _instance_id: string }
        Returns: Json
      }
      toggle_admin_active: {
        Args: { _is_active: boolean; _target_user_id: string }
        Returns: Json
      }
      unify_duplicate_clients: { Args: { _law_firm_id: string }; Returns: Json }
      update_admin_role: {
        Args: {
          _new_role: Database["public"]["Enums"]["admin_role"]
          _target_user_id: string
        }
        Returns: Json
      }
      update_client_status_with_follow_ups: {
        Args: { _client_id: string; _new_status_id: string }
        Returns: Json
      }
      user_belongs_to_law_firm: {
        Args: { _law_firm_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_role: "super_admin" | "admin_operacional" | "admin_financeiro"
      app_role: "admin" | "gerente" | "advogado" | "estagiario" | "atendente"
      case_status:
        | "novo_contato"
        | "triagem_ia"
        | "aguardando_documentos"
        | "em_analise"
        | "em_andamento"
        | "encerrado"
      legal_area:
        | "civil"
        | "trabalhista"
        | "penal"
        | "familia"
        | "consumidor"
        | "empresarial"
        | "tributario"
        | "ambiental"
        | "outros"
      message_handler: "ai" | "human"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_role: ["super_admin", "admin_operacional", "admin_financeiro"],
      app_role: ["admin", "gerente", "advogado", "estagiario", "atendente"],
      case_status: [
        "novo_contato",
        "triagem_ia",
        "aguardando_documentos",
        "em_analise",
        "em_andamento",
        "encerrado",
      ],
      legal_area: [
        "civil",
        "trabalhista",
        "penal",
        "familia",
        "consumidor",
        "empresarial",
        "tributario",
        "ambiental",
        "outros",
      ],
      message_handler: ["ai", "human"],
    },
  },
} as const
