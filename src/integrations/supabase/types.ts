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
      agent_knowledge: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          knowledge_item_id: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          knowledge_item_id: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          knowledge_item_id?: string
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
          id: string
          is_active: boolean
          last_prompt: string | null
          law_firm_id: string
          name: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          ai_prompt?: string | null
          ai_temperature?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_prompt?: string | null
          law_firm_id: string
          name: string
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          ai_prompt?: string | null
          ai_temperature?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_prompt?: string | null
          law_firm_id?: string
          name?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
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
          avatar_url: string | null
          created_at: string
          custom_status_id: string | null
          department_id: string | null
          document: string | null
          email: string | null
          id: string
          law_firm_id: string
          lgpd_consent: boolean
          lgpd_consent_date: string | null
          name: string
          notes: string | null
          phone: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          custom_status_id?: string | null
          department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          law_firm_id: string
          lgpd_consent?: boolean
          lgpd_consent_date?: string | null
          name: string
          notes?: string | null
          phone: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          custom_status_id?: string | null
          department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          law_firm_id?: string
          lgpd_consent?: boolean
          lgpd_consent_date?: string | null
          name?: string
          notes?: string | null
          phone?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "clients_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          law_firm_id: string | null
          max_instances: number | null
          max_users: number | null
          n8n_created_at: string | null
          n8n_last_error: string | null
          n8n_workflow_id: string | null
          n8n_workflow_name: string | null
          n8n_workflow_status: string | null
          name: string
          phone: string | null
          plan_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          law_firm_id?: string | null
          max_instances?: number | null
          max_users?: number | null
          n8n_created_at?: string | null
          n8n_last_error?: string | null
          n8n_workflow_id?: string | null
          n8n_workflow_name?: string | null
          n8n_workflow_status?: string | null
          name: string
          phone?: string | null
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          law_firm_id?: string | null
          max_instances?: number | null
          max_users?: number | null
          n8n_created_at?: string | null
          n8n_last_error?: string | null
          n8n_workflow_id?: string | null
          n8n_workflow_name?: string | null
          n8n_workflow_status?: string | null
          name?: string
          phone?: string | null
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
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
          ai_summary: string | null
          assigned_to: string | null
          client_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          current_handler: Database["public"]["Enums"]["message_handler"]
          department_id: string | null
          id: string
          internal_notes: string | null
          last_message_at: string | null
          law_firm_id: string
          n8n_last_response_at: string | null
          needs_human_handoff: boolean | null
          priority: number
          remote_jid: string
          status: Database["public"]["Enums"]["case_status"]
          tags: string[] | null
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          current_handler?: Database["public"]["Enums"]["message_handler"]
          department_id?: string | null
          id?: string
          internal_notes?: string | null
          last_message_at?: string | null
          law_firm_id: string
          n8n_last_response_at?: string | null
          needs_human_handoff?: boolean | null
          priority?: number
          remote_jid: string
          status?: Database["public"]["Enums"]["case_status"]
          tags?: string[] | null
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          current_handler?: Database["public"]["Enums"]["message_handler"]
          department_id?: string | null
          id?: string
          internal_notes?: string | null
          last_message_at?: string | null
          law_firm_id?: string
          n8n_last_response_at?: string | null
          needs_human_handoff?: boolean | null
          priority?: number
          remote_jid?: string
          status?: Database["public"]["Enums"]["case_status"]
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
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
        ]
      }
      custom_statuses: {
        Row: {
          color: string
          created_at: string
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
          created_at: string
          evolution_api_key: string | null
          evolution_api_url: string | null
          id: string
          law_firm_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          law_firm_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          law_firm_id?: string
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          document: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          phone2: string | null
          subdomain: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          phone2?: string | null
          subdomain?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          phone2?: string | null
          subdomain?: string | null
          updated_at?: string
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
          ai_generated: boolean
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          id: string
          is_from_me: boolean
          is_internal: boolean
          media_mime_type: string | null
          media_url: string | null
          message_type: string
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string | null
          sender_type: string
          status: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_from_me?: boolean
          is_internal?: boolean
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_from_me?: boolean
          is_internal?: boolean
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
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
          max_instances: number | null
          max_messages: number | null
          max_users: number | null
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
          max_instances?: number | null
          max_messages?: number | null
          max_users?: number | null
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
          max_instances?: number | null
          max_messages?: number | null
          max_users?: number | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
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
          default_department_id: string | null
          default_status_id: string | null
          id: string
          instance_id: string | null
          instance_name: string
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
          default_department_id?: string | null
          default_status_id?: string | null
          id?: string
          instance_id?: string | null
          instance_name: string
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
          default_department_id?: string | null
          default_status_id?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string
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
      [_ in never]: never
    }
    Functions: {
      get_admin_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["admin_role"]
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
      user_belongs_to_law_firm: {
        Args: { _law_firm_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_role: "super_admin" | "admin_operacional" | "admin_financeiro"
      app_role: "admin" | "advogado" | "estagiario" | "atendente"
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
      app_role: ["admin", "advogado", "estagiario", "atendente"],
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
