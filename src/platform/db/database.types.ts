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
  iam: {
    Tables: {
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
  iam: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

