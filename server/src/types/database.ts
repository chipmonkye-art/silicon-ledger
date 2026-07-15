export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          currency: string
          icon: string
          id: string
          include_in_assets: boolean
          name: string
          opening_balance: number
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          currency?: string
          icon?: string
          id?: string
          include_in_assets?: boolean
          name: string
          opening_balance?: number
          type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          currency?: string
          icon?: string
          id?: string
          include_in_assets?: boolean
          name?: string
          opening_balance?: number
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
      }
      categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          parent_id: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          parent_id?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          user_id?: string
          workspace_id?: string | null
        }
      }
      fx_rates: {
        Row: {
          base_currency: string
          quote_currency: string
          rate: number
          updated_at: string
        }
        Insert: {
          base_currency: string
          quote_currency: string
          rate: number
          updated_at?: string
        }
        Update: {
          base_currency?: string
          quote_currency?: string
          rate?: number
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          base_currency: string
          created_at: string
          id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          id?: string
        }
      }
      recurring_transactions: {
        Row: {
          account_id: string
          amount_minor: number
          category_id: string | null
          created_at: string
          currency: string
          description: string
          end_date: string | null
          id: string
          interval_days: number | null
          interval_type: string
          is_active: boolean
          note: string
          occurrences_remaining: number | null
          start_date: string
          to_account_id: string | null
          txn_type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          account_id: string
          amount_minor: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          end_date?: string | null
          id?: string
          interval_days?: number | null
          interval_type: string
          is_active?: boolean
          note?: string
          occurrences_remaining?: number | null
          start_date: string
          to_account_id?: string | null
          txn_type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          account_id?: string
          amount_minor?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          end_date?: string | null
          id?: string
          interval_days?: number | null
          interval_type?: string
          is_active?: boolean
          note?: string
          occurrences_remaining?: number | null
          start_date?: string
          to_account_id?: string | null
          txn_type?: string
          user_id?: string
          workspace_id?: string | null
        }
      }
      transaction_audit: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          transaction_id?: string
          user_id?: string
        }
      }
      transactions: {
        Row: {
          account_id: string
          amount_minor: number
          category_id: string | null
          created_at: string
          currency: string
          description: string
          id: string
          is_staged: boolean
          note: string
          occurred_on: string
          recurring_id: string | null
          to_account_id: string | null
          txn_type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          account_id: string
          amount_minor: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_staged?: boolean
          note?: string
          occurred_on: string
          recurring_id?: string | null
          to_account_id?: string | null
          txn_type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          account_id?: string
          amount_minor?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_staged?: boolean
          note?: string
          occurred_on?: string
          recurring_id?: string | null
          to_account_id?: string | null
          txn_type?: string
          user_id?: string
          workspace_id?: string | null
        }
      }
      user_workspaces: {
        Row: {
          invited_by: string | null
          joined_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          account_type: string | null
          currency: string | null
          current_balance: number | null
          include_in_assets: boolean | null
          user_id: string | null
          workspace_id: string | null
        }
      }
    }
    Functions: {
      generate_recurring_transactions: { Args: never; Returns: number }
      seed_user_data: { Args: never; Returns: undefined }
    }
    Enums: {}
    CompositeTypes: {}
  }
}
