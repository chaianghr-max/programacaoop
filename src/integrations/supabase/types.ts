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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_prefs: {
        Row: {
          chave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          valor?: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      componentes: {
        Row: {
          cavidades: number | null
          ciclo_s: number | null
          descricao: string
          id: string
          injetora: string | null
          mp: string
          ordem: number
          peso_g: number | null
          produto_id: string
          valor_kg: number | null
        }
        Insert: {
          cavidades?: number | null
          ciclo_s?: number | null
          descricao?: string
          id: string
          injetora?: string | null
          mp?: string
          ordem?: number
          peso_g?: number | null
          produto_id: string
          valor_kg?: number | null
        }
        Update: {
          cavidades?: number | null
          ciclo_s?: number | null
          descricao?: string
          id?: string
          injetora?: string | null
          mp?: string
          ordem?: number
          peso_g?: number | null
          produto_id?: string
          valor_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "componentes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_itens: {
        Row: {
          created_at: string
          descricao: string
          fornecedor: string
          icms: number | null
          id: string
          ipi: number | null
          valor_kg: number | null
        }
        Insert: {
          created_at?: string
          descricao?: string
          fornecedor?: string
          icms?: number | null
          id: string
          ipi?: number | null
          valor_kg?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string
          fornecedor?: string
          icms?: number | null
          id?: string
          ipi?: number | null
          valor_kg?: number | null
        }
        Relationships: []
      }
      ordens_entregas: {
        Row: {
          entregue: boolean
          ordem_id: string
          sku: string
          updated_at: string
        }
        Insert: {
          entregue?: boolean
          ordem_id: string
          sku: string
          updated_at?: string
        }
        Update: {
          entregue?: boolean
          ordem_id?: string
          sku?: string
          updated_at?: string
        }
        Relationships: []
      }
      pedidos_importados: {
        Row: {
          data: string | null
          fornecedor: string | null
          importado_em: string
          itens: Json
          numero: string | null
          slot: number
        }
        Insert: {
          data?: string | null
          fornecedor?: string | null
          importado_em?: string
          itens?: Json
          numero?: string | null
          slot: number
        }
        Update: {
          data?: string | null
          fornecedor?: string | null
          importado_em?: string
          itens?: Json
          numero?: string | null
          slot?: number
        }
        Relationships: []
      }
      produtos: {
        Row: {
          caixa_tipo: string | null
          created_at: string
          cxs_pallet: number | null
          etiqueta: string | null
          id: string
          imagem: string | null
          nome: string
          pcs_caixa: number | null
          pcs_pallet: number | null
          skus: string[]
          tipo: string
        }
        Insert: {
          caixa_tipo?: string | null
          created_at?: string
          cxs_pallet?: number | null
          etiqueta?: string | null
          id: string
          imagem?: string | null
          nome?: string
          pcs_caixa?: number | null
          pcs_pallet?: number | null
          skus?: string[]
          tipo?: string
        }
        Update: {
          caixa_tipo?: string | null
          created_at?: string
          cxs_pallet?: number | null
          etiqueta?: string | null
          id?: string
          imagem?: string | null
          nome?: string
          pcs_caixa?: number | null
          pcs_pallet?: number | null
          skus?: string[]
          tipo?: string
        }
        Relationships: []
      }
      programacao_manual: {
        Row: {
          quantidade: number
          sku: string
          updated_at: string
        }
        Insert: {
          quantidade?: number
          sku: string
          updated_at?: string
        }
        Update: {
          quantidade?: number
          sku?: string
          updated_at?: string
        }
        Relationships: []
      }
      skus: {
        Row: {
          created_at: string
          descricao: string
          id: string
          sku: string
          tipo: string
        }
        Insert: {
          created_at?: string
          descricao?: string
          id: string
          sku?: string
          tipo?: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          sku?: string
          tipo?: string
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
