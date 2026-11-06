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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bux_catalog: {
        Row: {
          amount: number
          club_id: string | null
          duration_days: number | null
          id: string
          kind: string
          name: string
        }
        Insert: {
          amount: number
          club_id?: string | null
          duration_days?: number | null
          id: string
          kind: string
          name: string
        }
        Update: {
          amount?: number
          club_id?: string | null
          duration_days?: number | null
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      bux_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          idempotency_key: string
          item_id: string
          kind: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          idempotency_key: string
          item_id: string
          kind: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          item_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bux_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "bux_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      bux_unlocks: {
        Row: {
          item_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          item_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          item_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bux_unlocks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "bux_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      bux_wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      careers: {
        Row: {
          balance: number
          club_id: string
          club_name: string
          created_at: string
          current_date: string
          data: Json | null
          id: string
          legacy_id: string | null
          legacy_user_id: string | null
          season: string
          transfer_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          club_id: string
          club_name: string
          created_at?: string
          current_date?: string
          data?: Json | null
          id?: string
          legacy_id?: string | null
          legacy_user_id?: string | null
          season?: string
          transfer_budget?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          balance?: number
          club_id?: string
          club_name?: string
          created_at?: string
          current_date?: string
          data?: Json | null
          id?: string
          legacy_id?: string | null
          legacy_user_id?: string | null
          season?: string
          transfer_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      careers_backup_20261105: {
        Row: {
          balance: number | null
          club_id: string | null
          club_name: string | null
          created_at: string | null
          current_date: string | null
          data: Json | null
          id: string | null
          legacy_id: string | null
          legacy_user_id: string | null
          season: string | null
          transfer_budget: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          balance?: number | null
          club_id?: string | null
          club_name?: string | null
          created_at?: string | null
          current_date?: string | null
          data?: Json | null
          id?: string | null
          legacy_id?: string | null
          legacy_user_id?: string | null
          season?: string | null
          transfer_budget?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          balance?: number | null
          club_id?: string | null
          club_name?: string | null
          created_at?: string | null
          current_date?: string | null
          data?: Json | null
          id?: string | null
          legacy_id?: string | null
          legacy_user_id?: string | null
          season?: string | null
          transfer_budget?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      football_api_budget: {
        Row: {
          blocked_until: string | null
          day: string
          used: number
        }
        Insert: {
          blocked_until?: string | null
          day: string
          used?: number
        }
        Update: {
          blocked_until?: string | null
          day?: string
          used?: number
        }
        Relationships: []
      }
      football_api_cache: {
        Row: {
          fetched_at: string | null
          locked_until: string | null
          payload: Json | null
          request_key: string
        }
        Insert: {
          fetched_at?: string | null
          locked_until?: string | null
          payload?: Json | null
          request_key: string
        }
        Update: {
          fetched_at?: string | null
          locked_until?: string | null
          payload?: Json | null
          request_key?: string
        }
        Relationships: []
      }
      legacy_users: {
        Row: {
          auth_user_id: string | null
          claimed_at: string | null
          created_at: string
          email: string
          legacy_id: string
          name: string | null
        }
        Insert: {
          auth_user_id?: string | null
          claimed_at?: string | null
          created_at?: string
          email: string
          legacy_id: string
          name?: string | null
        }
        Update: {
          auth_user_id?: string | null
          claimed_at?: string | null
          created_at?: string
          email?: string
          legacy_id?: string
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bux_apply: {
        Args: { p_item: string; p_key: string; p_reward: boolean }
        Returns: Json
      }
      bux_claim_reward: {
        Args: { p_item: string; p_key: string }
        Returns: Json
      }
      bux_purchase: { Args: { p_item: string; p_key: string }; Returns: Json }
      claim_legacy_account: { Args: never; Returns: number }
      reserve_football_request: { Args: { p_key: string }; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
