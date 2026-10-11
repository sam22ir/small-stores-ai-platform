// Generated from the Supabase schema (generate_typescript_types), helper generics removed.
// Regenerate after schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          conversation_id: string
          created_at: string
          error: string | null
          fast_path: boolean
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          provider: string | null
          provider_errors: Json | null
          source: string
          store_id: string
          tool_calls: Json
          trigger_message_id: string | null
          used_credit: boolean
        }
        Insert: {
          conversation_id: string
          created_at?: string
          error?: string | null
          fast_path?: boolean
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          provider?: string | null
          provider_errors?: Json | null
          source?: string
          store_id: string
          tool_calls?: Json
          trigger_message_id?: string | null
          used_credit?: boolean
        }
        Update: {
          conversation_id?: string
          created_at?: string
          error?: string | null
          fast_path?: boolean
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          provider?: string | null
          provider_errors?: Json | null
          source?: string
          store_id?: string
          tool_calls?: Json
          trigger_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_conversation_store_fk"
            columns: ["conversation_id", "store_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "agent_runs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_credentials: {
        Row: {
          access_token_encrypted: string
          channel_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          channel_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          channel_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_credentials_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          platform: string
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          platform: string
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          platform?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel_id: string
          created_at: string
          customer_id: string
          handoff_reason: string | null
          id: string
          last_customer_message_at: string | null
          processing_until: string | null
          status: string
          store_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          customer_id: string
          handoff_reason?: string | null
          id?: string
          last_customer_message_at?: string | null
          processing_until?: string | null
          status?: string
          store_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          customer_id?: string
          handoff_reason?: string | null
          id?: string
          last_customer_message_at?: string | null
          processing_until?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_store_fk"
            columns: ["channel_id", "store_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "conversations_customer_store_fk"
            columns: ["customer_id", "store_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          channel_id: string
          created_at: string
          display_name: string | null
          id: string
          platform_user_id: string
          store_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          platform_user_id: string
          store_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          platform_user_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_channel_store_fk"
            columns: ["channel_id", "store_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_fees: {
        Row: {
          created_at: string
          fee_cents: number
          id: string
          store_id: string
          wilaya: string
        }
        Insert: {
          created_at?: string
          fee_cents: number
          id?: string
          store_id: string
          wilaya: string
        }
        Update: {
          created_at?: string
          fee_cents?: number
          id?: string
          store_id?: string
          wilaya?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_fees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_entries: {
        Row: {
          answer: string
          conversation_id: string | null
          created_at: string
          id: string
          question: string
          store_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          question: string
          store_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          question?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faq_entries_conversation_id_store_id_fkey"
            columns: ["conversation_id", "store_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "faq_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          channel_id: string
          conversation_id: string
          created_at: string
          delivery_status: string | null
          delivery_claimed_at: string | null
          delivery_error: string | null
          direction: string
          id: string
          platform_message_id: string | null
          processed_at: string | null
          sender: string
          store_id: string
        }
        Insert: {
          body?: string | null
          channel_id: string
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          delivery_claimed_at?: string | null
          delivery_error?: string | null
          direction: string
          id?: string
          platform_message_id?: string | null
          processed_at?: string | null
          sender: string
          store_id: string
        }
        Update: {
          body?: string | null
          channel_id?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          delivery_claimed_at?: string | null
          delivery_error?: string | null
          direction?: string
          id?: string
          platform_message_id?: string | null
          processed_at?: string | null
          sender?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_store_fk"
            columns: ["channel_id", "store_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "messages_conversation_store_fk"
            columns: ["conversation_id", "store_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          store_id: string
          unit_price_cents: number
          variant_id: string | null
          variant_label: string
        }
        Insert: {
          id?: string
          name: string
          order_id: string
          product_id?: string | null
          quantity: number
          store_id: string
          unit_price_cents: number
          variant_id?: string | null
          variant_label?: string
        }
        Update: {
          id?: string
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          store_id?: string
          unit_price_cents?: number
          variant_id?: string | null
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          delivery_fee_cents: number
          id: string
          idempotency_key: string | null
          phone: string
          status: string
          store_id: string
          subtotal_cents: number
          total_cents: number
          updated_at: string
          wilaya: string
        }
        Insert: {
          address: string
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          delivery_fee_cents?: number
          id?: string
          idempotency_key?: string | null
          phone: string
          status?: string
          store_id: string
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          wilaya: string
        }
        Update: {
          address?: string
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          delivery_fee_cents?: number
          id?: string
          idempotency_key?: string | null
          phone?: string
          status?: string
          store_id?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          wilaya?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_conversation_id_store_id_fkey"
            columns: ["conversation_id", "store_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "orders_customer_id_store_id_fkey"
            columns: ["customer_id", "store_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          checkout_id: string
          created_at: string
          credits: number | null
          currency: string
          id: string
          kind: "subscription" | "credits"
          status: "pending" | "paid" | "failed" | "canceled"
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_id: string
          created_at?: string
          credits?: number | null
          currency?: string
          id?: string
          kind?: "subscription" | "credits"
          status?: "pending" | "paid" | "failed" | "canceled"
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_id?: string
          created_at?: string
          credits?: number | null
          currency?: string
          id?: string
          kind?: "subscription" | "credits"
          status?: "pending" | "paid" | "failed" | "canceled"
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          id: string
          label: string
          price_cents: number | null
          product_id: string
          sku: string | null
          stock_quantity: number
          store_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          label?: string
          price_cents?: number | null
          product_id: string
          sku?: string | null
          stock_quantity?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          price_cents?: number | null
          product_id?: string
          sku?: string | null
          stock_quantity?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variants_product_store_fk"
            columns: ["product_id", "store_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          aliases: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          price_cents: number
          sold_out_until: string | null
          stock_checked_at: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          aliases?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_cents: number
          sold_out_until?: string | null
          stock_checked_at?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          aliases?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number
          sold_out_until?: string | null
          stock_checked_at?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          agent_enabled: boolean
          business_info: string | null
          business_info_fields: Json | null
          created_at: string
          currency: string
          id: string
          monthly_reply_limit: number
          name: string
          paid_until: string | null
          plan_status: "trial" | "active" | "past_due"
          trial_ends_at: string
          orders_enabled: boolean
          reply_credits: number
          timezone: string
        }
        Insert: {
          agent_enabled?: boolean
          business_info?: string | null
          business_info_fields?: Json | null
          created_at?: string
          currency?: string
          id?: string
          monthly_reply_limit?: number
          name: string
          paid_until?: string | null
          plan_status?: "trial" | "active" | "past_due"
          trial_ends_at?: string
          orders_enabled?: boolean
          reply_credits?: number
          timezone?: string
        }
        Update: {
          agent_enabled?: boolean
          business_info?: string | null
          business_info_fields?: Json | null
          created_at?: string
          currency?: string
          id?: string
          monthly_reply_limit?: number
          name?: string
          paid_until?: string | null
          plan_status?: "trial" | "active" | "past_due"
          trial_ends_at?: string
          orders_enabled?: boolean
          timezone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_store: {
        Args: { p_currency?: string; p_name: string }
        Returns: string
      }
      is_store_member: { Args: { p_store_id: string }; Returns: boolean }
      is_store_owner: { Args: { p_store_id: string }; Returns: boolean }
      adjust_stock: {
        Args: { p_delta: number; p_variant_id: string }
        Returns: number
      }
      save_product: {
        Args: { p_product: Json; p_product_id: string | null; p_store_id: string; p_variants: Json }
        Returns: string
      }
      inbox_list: {
        Args: {
          p_store_id: string
          p_status: string | null
          p_search: string | null
          p_limit?: number
          p_before_at?: string | null
          p_before_id?: string | null
        }
        Returns: {
          id: string
          status: string
          handoff_reason: string | null
          last_customer_message_at: string | null
          created_at: string
          customer_name: string | null
          platform_user_id: string
          platform: string
          last_body: string | null
          last_direction: string | null
          last_message_at: string | null
        }[]
      }
      set_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: string
      }
      store_insights: {
        Args: { p_store_id: string; p_days: number }
        Returns: Json
      }
      telegram_link: {
        Args: { p_store_id: string }
        Returns: { connected: boolean; code: string }
      }
      telegram_unlink: {
        Args: { p_store_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
