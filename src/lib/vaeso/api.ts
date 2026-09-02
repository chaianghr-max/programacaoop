import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Componente, MpItem, Pedido, Produto, Sku } from "./types";

export const novoId = (prefixo: string) =>
  `${prefixo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

async function carregarDados() {
  const [produtos, componentes, skus, mpItens, pedidos, manual] = await Promise.all([
    supabase.from("produtos").select("*").order("nome"),
    supabase.from("componentes").select("*").order("ordem"),
    supabase.from("skus").select("*").order("sku"),
    supabase.from("mp_itens").select("*").order("descricao"),
    supabase.from("pedidos_importados").select("*").order("slot"),
    supabase.from("programacao_manual").select("*"),
  ]);
  const erro =
    produtos.error || componentes.error || skus.error || mpItens.error || pedidos.error || manual.error;
  if (erro) throw erro;

  return {
    produtos: (produtos.data ?? []) as unknown as Produto[],
    componentes: (componentes.data ?? []) as unknown as Componente[],
    skus: (skus.data ?? []) as unknown as Sku[],
    mpItens: (mpItens.data ?? []) as unknown as MpItem[],
    pedidos: (pedidos.data ?? []) as unknown as Pedido[],
    manual: Object.fromEntries(
      ((manual.data ?? []) as Array<{ sku: string; quantidade: number }>).map((m) => [
        m.sku,
        Number(m.quantidade),
      ]),
    ) as Record<string, number>,
  };
}

export type Dados = Awaited<ReturnType<typeof carregarDados>>;

export function useDados(enabled: boolean) {
  return useQuery({ queryKey: ["vaeso"], queryFn: carregarDados, enabled });
}

export function useSalvar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => {
      const res = (await fn()) as { error?: { message: string } } | unknown;
      const erro = (res as { error?: { message: string } })?.error;
      if (erro) throw new Error(erro.message);
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vaeso"] });
    },
  });
}
