export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  core: {
    Tables: {
      identifier_allocation: {
        Row: {
          allocated_actor_id: string
          allocated_actor_type: string
          allocated_at: string
          causation_id: string | null
          command_id: string
          correlation_id: string
          id: string
          identifier_value: string
          legal_entity_id: string | null
          organisation_id: string
          period_key: string | null
          period_token: string | null
          request_id: string
          sequence_id: string
          sequence_value: number
          series_id: string
          site_id: string | null
        }
        Insert: {
          allocated_actor_id: string
          allocated_actor_type: string
          allocated_at: string
          causation_id?: string | null
          command_id: string
          correlation_id: string
          id: string
          identifier_value: string
          legal_entity_id?: string | null
          organisation_id: string
          period_key?: string | null
          period_token?: string | null
          request_id: string
          sequence_id: string
          sequence_value: number
          series_id: string
          site_id?: string | null
        }
        Update: {
          allocated_actor_id?: string
          allocated_actor_type?: string
          allocated_at?: string
          causation_id?: string | null
          command_id?: string
          correlation_id?: string
          id?: string
          identifier_value?: string
          legal_entity_id?: string | null
          organisation_id?: string
          period_key?: string | null
          period_token?: string | null
          request_id?: string
          sequence_id?: string
          sequence_value?: number
          series_id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identifier_allocation_legal_scope_fk"
            columns: ["legal_entity_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "legal_entity"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "identifier_allocation_sequence_fk"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "identifier_sequence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identifier_allocation_series_scope_fk"
            columns: ["series_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "identifier_series"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "identifier_allocation_site_scope_fk"
            columns: ["site_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "site"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      identifier_sequence: {
        Row: {
          created_at: string
          id: string
          legal_entity_id: string | null
          next_value: number
          organisation_id: string
          period_key: string | null
          period_token: string | null
          series_id: string
          site_id: string | null
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at: string
          id: string
          legal_entity_id?: string | null
          next_value?: number
          organisation_id: string
          period_key?: string | null
          period_token?: string | null
          series_id: string
          site_id?: string | null
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          next_value?: number
          organisation_id?: string
          period_key?: string | null
          period_token?: string | null
          series_id?: string
          site_id?: string | null
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "identifier_sequence_legal_scope_fk"
            columns: ["legal_entity_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "legal_entity"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "identifier_sequence_series_scope_fk"
            columns: ["series_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "identifier_series"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "identifier_sequence_site_scope_fk"
            columns: ["site_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "site"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
      identifier_series: {
        Row: {
          created_actor_id: string
          created_actor_type: string
          created_at: string
          description: string | null
          format_template: string
          id: string
          organisation_id: string
          requires_period: boolean
          scope_legal_entity: boolean
          scope_site: boolean
          sequence_width: number
          series_key: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          created_actor_id: string
          created_actor_type: string
          created_at: string
          description?: string | null
          format_template: string
          id: string
          organisation_id: string
          requires_period?: boolean
          scope_legal_entity?: boolean
          scope_site?: boolean
          sequence_width: number
          series_key: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          description?: string | null
          format_template?: string
          id?: string
          organisation_id?: string
          requires_period?: boolean
          scope_legal_entity?: boolean
          scope_site?: boolean
          sequence_width?: number
          series_key?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "identifier_series_organisation_fk"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisation"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_entity: {
        Row: {
          code: string
          country_code: string | null
          created_actor_id: string
          created_actor_type: string
          created_at: string
          display_name: string | null
          id: string
          legal_name: string
          organisation_id: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          country_code?: string | null
          created_actor_id: string
          created_actor_type: string
          created_at: string
          display_name?: string | null
          id: string
          legal_name: string
          organisation_id: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          code?: string
          country_code?: string | null
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          display_name?: string | null
          id?: string
          legal_name?: string
          organisation_id?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "legal_entity_organisation_fk"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisation"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation: {
        Row: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          name: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          name: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          code?: string
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      site: {
        Row: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          name: string
          organisation_id: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          name: string
          organisation_id: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          code?: string
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          id?: string
          name?: string
          organisation_id?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_organisation_fk"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisation"
            referencedColumns: ["id"]
          },
        ]
      }
      site_legal_entity: {
        Row: {
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          legal_entity_id: string
          organisation_id: string
          site_id: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          legal_entity_id: string
          organisation_id: string
          site_id: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          id?: string
          legal_entity_id?: string
          organisation_id?: string
          site_id?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_legal_entity_legal_scope_fk"
            columns: ["legal_entity_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "legal_entity"
            referencedColumns: ["id", "organisation_id"]
          },
          {
            foreignKeyName: "site_legal_entity_site_scope_fk"
            columns: ["site_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "site"
            referencedColumns: ["id", "organisation_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  governance: {
    Tables: {
      approval_decision: {
        Row: {
          approval_request_id: string
          approver_user_id: string
          capability_code: string
          causation_id: string | null
          command_id: string
          correlation_id: string
          decided_at: string
          decision: string
          id: string
          legal_entity_id: string | null
          organisation_id: string
          reason: string | null
          request_id: string
          site_id: string | null
        }
        Insert: {
          approval_request_id: string
          approver_user_id: string
          capability_code: string
          causation_id?: string | null
          command_id: string
          correlation_id: string
          decided_at: string
          decision: string
          id: string
          legal_entity_id?: string | null
          organisation_id: string
          reason?: string | null
          request_id: string
          site_id?: string | null
        }
        Update: {
          approval_request_id?: string
          approver_user_id?: string
          capability_code?: string
          causation_id?: string | null
          command_id?: string
          correlation_id?: string
          decided_at?: string
          decision?: string
          id?: string
          legal_entity_id?: string | null
          organisation_id?: string
          reason?: string | null
          request_id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_decision_request_fk"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_request"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_request: {
        Row: {
          causation_id: string | null
          command_id: string
          correlation_id: string
          id: string
          legal_entity_id: string | null
          organisation_id: string
          policy_code: string
          request_capability_code: string
          request_id: string
          requested_action: string
          requested_at: string
          requester_user_id: string
          require_distinct_humans: boolean
          required_approval_count: number
          required_capability_codes: string[]
          resource_id: string
          resource_type: string
          self_approval_allowed: boolean
          site_id: string | null
          status: string
          version: number
        }
        Insert: {
          causation_id?: string | null
          command_id: string
          correlation_id: string
          id: string
          legal_entity_id?: string | null
          organisation_id: string
          policy_code: string
          request_capability_code: string
          request_id: string
          requested_action: string
          requested_at: string
          requester_user_id: string
          require_distinct_humans?: boolean
          required_approval_count: number
          required_capability_codes: string[]
          resource_id: string
          resource_type: string
          self_approval_allowed?: boolean
          site_id?: string | null
          status?: string
          version?: number
        }
        Update: {
          causation_id?: string | null
          command_id?: string
          correlation_id?: string
          id?: string
          legal_entity_id?: string | null
          organisation_id?: string
          policy_code?: string
          request_capability_code?: string
          request_id?: string
          requested_action?: string
          requested_at?: string
          requester_user_id?: string
          require_distinct_humans?: boolean
          required_approval_count?: number
          required_capability_codes?: string[]
          resource_id?: string
          resource_type?: string
          self_approval_allowed?: boolean
          site_id?: string | null
          status?: string
          version?: number
        }
        Relationships: []
      }
      audit_event: {
        Row: {
          action: string
          actor_id: string
          actor_type: string
          authenticated_user_id: string | null
          authorizing_capability: string | null
          causation_id: string | null
          command_id: string | null
          correlation_id: string
          creation_txid: string
          event_type: string
          event_version: number
          id: string
          legal_entity_id: string | null
          metadata: Json
          occurred_at: string
          organisation_id: string
          outcome: string
          reason: string | null
          recorded_at: string
          request_id: string
          resource_id: string
          resource_type: string
          site_id: string | null
          source_module: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_type: string
          authenticated_user_id?: string | null
          authorizing_capability?: string | null
          causation_id?: string | null
          command_id?: string | null
          correlation_id: string
          creation_txid: string
          event_type: string
          event_version: number
          id: string
          legal_entity_id?: string | null
          metadata?: Json
          occurred_at: string
          organisation_id: string
          outcome: string
          reason?: string | null
          recorded_at: string
          request_id: string
          resource_id: string
          resource_type: string
          site_id?: string | null
          source_module: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_type?: string
          authenticated_user_id?: string | null
          authorizing_capability?: string | null
          causation_id?: string | null
          command_id?: string | null
          correlation_id?: string
          creation_txid?: string
          event_type?: string
          event_version?: number
          id?: string
          legal_entity_id?: string | null
          metadata?: Json
          occurred_at?: string
          organisation_id?: string
          outcome?: string
          reason?: string | null
          recorded_at?: string
          request_id?: string
          resource_id?: string
          resource_type?: string
          site_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      hold: {
        Row: {
          blocked_action: string | null
          hold_type: string
          id: string
          legal_entity_id: string | null
          organisation_id: string
          placed_at: string
          placed_by_user_id: string
          placement_capability_code: string
          placement_command_id: string
          reason: string
          release_approval_request_id: string | null
          release_capability_code: string
          release_reason: string | null
          release_requires_approval: boolean
          released_at: string | null
          released_by_user_id: string | null
          resource_id: string
          resource_type: string
          site_id: string | null
          status: string
          version: number
        }
        Insert: {
          blocked_action?: string | null
          hold_type: string
          id: string
          legal_entity_id?: string | null
          organisation_id: string
          placed_at: string
          placed_by_user_id: string
          placement_capability_code: string
          placement_command_id: string
          reason: string
          release_approval_request_id?: string | null
          release_capability_code: string
          release_reason?: string | null
          release_requires_approval?: boolean
          released_at?: string | null
          released_by_user_id?: string | null
          resource_id: string
          resource_type: string
          site_id?: string | null
          status?: string
          version?: number
        }
        Update: {
          blocked_action?: string | null
          hold_type?: string
          id?: string
          legal_entity_id?: string | null
          organisation_id?: string
          placed_at?: string
          placed_by_user_id?: string
          placement_capability_code?: string
          placement_command_id?: string
          reason?: string
          release_approval_request_id?: string | null
          release_capability_code?: string
          release_reason?: string | null
          release_requires_approval?: boolean
          released_at?: string | null
          released_by_user_id?: string | null
          resource_id?: string
          resource_type?: string
          site_id?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hold_release_approval_fk"
            columns: ["release_approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_request"
            referencedColumns: ["id"]
          },
        ]
      }
      hold_action: {
        Row: {
          acted_at: string
          action: string
          actor_user_id: string
          approval_request_id: string | null
          causation_id: string | null
          command_id: string
          correlation_id: string
          hold_id: string
          id: string
          legal_entity_id: string | null
          organisation_id: string
          reason: string
          request_id: string
          site_id: string | null
        }
        Insert: {
          acted_at: string
          action: string
          actor_user_id: string
          approval_request_id?: string | null
          causation_id?: string | null
          command_id: string
          correlation_id: string
          hold_id: string
          id: string
          legal_entity_id?: string | null
          organisation_id: string
          reason: string
          request_id: string
          site_id?: string | null
        }
        Update: {
          acted_at?: string
          action?: string
          actor_user_id?: string
          approval_request_id?: string | null
          causation_id?: string | null
          command_id?: string
          correlation_id?: string
          hold_id?: string
          id?: string
          legal_entity_id?: string | null
          organisation_id?: string
          reason?: string
          request_id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hold_action_approval_fk"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hold_action_hold_fk"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "hold"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_human_audit_event: {
        Args: {
          p_action: string
          p_authorizing_capability: string
          p_causation_id: string
          p_command_id: string
          p_correlation_id: string
          p_event_type: string
          p_event_version: number
          p_id: string
          p_legal_entity_id: string
          p_metadata: Json
          p_occurred_at: string
          p_organisation_id: string
          p_outcome: string
          p_reason: string
          p_recorded_at: string
          p_request_id: string
          p_resource_id: string
          p_resource_type: string
          p_site_id: string
          p_source_module: string
        }
        Returns: string
      }
      append_system_audit_event: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_type: string
          p_causation_id: string
          p_command_id: string
          p_correlation_id: string
          p_event_type: string
          p_event_version: number
          p_id: string
          p_legal_entity_id: string
          p_metadata: Json
          p_occurred_at: string
          p_organisation_id: string
          p_outcome: string
          p_reason: string
          p_recorded_at: string
          p_request_id: string
          p_resource_id: string
          p_resource_type: string
          p_site_id: string
          p_source_module: string
        }
        Returns: string
      }
      audit_metadata_is_safe: { Args: { p_value: Json }; Returns: boolean }
      create_approval_request: {
        Args: {
          p_causation_id: string
          p_command_id: string
          p_correlation_id: string
          p_id: string
          p_legal_entity_id: string
          p_organisation_id: string
          p_policy_code: string
          p_request_capability_code: string
          p_request_id: string
          p_requested_action: string
          p_requested_at: string
          p_require_distinct_humans: boolean
          p_required_approval_count: number
          p_required_capability_codes: string[]
          p_resource_id: string
          p_resource_type: string
          p_self_approval_allowed: boolean
          p_site_id: string
        }
        Returns: {
          current_status: string
          record_id: string
          replayed: boolean
        }[]
      }
      decide_approval: {
        Args: {
          p_approval_request_id: string
          p_capability_code: string
          p_causation_id: string
          p_command_id: string
          p_correlation_id: string
          p_decided_at: string
          p_decision: string
          p_decision_id: string
          p_reason: string
          p_request_id: string
        }
        Returns: {
          current_status: string
          record_id: string
          replayed: boolean
        }[]
      }
      has_blocking_hold: {
        Args: {
          p_action: string
          p_legal_entity_id: string
          p_organisation_id: string
          p_resource_id: string
          p_resource_type: string
          p_site_id: string
        }
        Returns: boolean
      }
      place_hold: {
        Args: {
          p_action_id: string
          p_blocked_action: string
          p_causation_id: string
          p_command_id: string
          p_correlation_id: string
          p_hold_id: string
          p_hold_type: string
          p_legal_entity_id: string
          p_organisation_id: string
          p_placed_at: string
          p_placement_capability_code: string
          p_reason: string
          p_release_capability_code: string
          p_release_requires_approval: boolean
          p_request_id: string
          p_resource_id: string
          p_resource_type: string
          p_site_id: string
        }
        Returns: {
          current_status: string
          record_id: string
          replayed: boolean
        }[]
      }
      release_hold: {
        Args: {
          p_action_id: string
          p_approval_request_id: string
          p_causation_id: string
          p_command_id: string
          p_correlation_id: string
          p_hold_id: string
          p_reason: string
          p_released_at: string
          p_request_id: string
        }
        Returns: {
          current_status: string
          record_id: string
          replayed: boolean
        }[]
      }
      unique_safe_codes: { Args: { p_values: string[] }; Returns: boolean }
      valid_code: {
        Args: { p_max?: number; p_value: string }
        Returns: boolean
      }
      valid_resource_type: { Args: { p_value: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  iam: {
    Tables: {
      capability: {
        Row: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          kind: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          description?: string | null
          display_name: string
          id: string
          kind?: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          code?: string
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          kind?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      role: {
        Row: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          kind: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          description?: string | null
          display_name: string
          id: string
          kind?: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          code?: string
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          kind?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      role_assignment: {
        Row: {
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          legal_entity_id: string | null
          organisation_id: string
          role_id: string
          scope_level: string
          site_id: string | null
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          user_profile_id: string
          valid_from: string
          valid_until: string | null
          version: number
        }
        Insert: {
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          legal_entity_id?: string | null
          organisation_id: string
          role_id: string
          scope_level: string
          site_id?: string | null
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          user_profile_id: string
          valid_from: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          organisation_id?: string
          role_id?: string
          scope_level?: string
          site_id?: string | null
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          user_profile_id?: string
          valid_from?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_assignment_role_fk"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignment_user_fk"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      role_capability: {
        Row: {
          capability_id: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          role_id: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          capability_id: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          id: string
          role_id: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          capability_id?: string
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          id?: string
          role_id?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_capability_capability_fk"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_capability_role_fk"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          auth_user_id: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          display_name: string
          email_snapshot: string | null
          id: string
          status: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version: number
        }
        Insert: {
          auth_user_id: string
          created_actor_id: string
          created_actor_type: string
          created_at: string
          display_name: string
          email_snapshot?: string | null
          id: string
          status?: string
          updated_actor_id: string
          updated_actor_type: string
          updated_at: string
          version?: number
        }
        Update: {
          auth_user_id?: string
          created_actor_id?: string
          created_actor_type?: string
          created_at?: string
          display_name?: string
          email_snapshot?: string | null
          id?: string
          status?: string
          updated_actor_id?: string
          updated_actor_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  core: {
    Enums: {},
  },
  governance: {
    Enums: {},
  },
  iam: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

