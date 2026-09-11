import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, PackageCheck, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Dados } from "@/lib/vaeso/api";
import { fmtInt, num } from "@/lib/vaeso/calc";

type EntregaPks = {
  id: string;
  sku: string;
  quantidade: number;
  status: string;
};

type Baixa = {
  id: string;
  nf_numero: string;
  nf_data: string | null;
  sku: string;
  quantidade: number;
  created_at: string;
};

const PREFIXO = "EXPEDICAO ";

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

const horaBr = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ExpedicaoTab({ dados, podeEditar = true }: { dados: Dados; podeEditar?: boolean }) {
  const [busca, setBusca] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: aceitas = [] } = useQuery({
    queryKey: ["pks-entregas", "estoque"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pks_entregas")
        .select("id,ordem_id,sku,quantidade,status,accepted_at,created_at")
        .neq("status", "cancelado")
        .order("created_at");
      if (error) throw error;
      return data as EntregaPks[];
    },
  });

  const { data: baixas = [] } = useQuery({
    queryKey: ["pks-estoque-baixas"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pks_estoque_baixas")
        .select("id,nf_numero,nf_data,sku,quantidade,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Baixa[];
    },
  });

  const saldoPorSku = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of aceitas) {
      const chave = normalizar(item.sku);
      mapa.set(chave, (mapa.get(chave) ?? 0) + Number(item.quantidade));
    }
    for (const item of baixas) {
      const chave = normalizar(item.sku);
      mapa.set(chave, (mapa.get(chave) ?? 0) - Number(item.quantidade));
    }
    return mapa;
  }, [aceitas, baixas]);

  const termo = busca.trim().toLowerCase();

  const itens = useMemo(
    () =>
      dados.skus
        .filter(
          (s) =>
            !termo ||
            s.sku.toLowerCase().includes(termo) ||
            s.descricao.toLowerCase().includes(termo) ||
            s.tipo.toLowerCase().includes(termo),
        )
        .map((s) => ({ ...s, saldo: saldoPorSku.get(normalizar(s.sku)) ?? 0 }))
        .sort((a, b) => a.sku.localeCompare(b.sku)),
    [dados.skus, saldoPorSku, termo],
  );

  const expedicoesHoje = useMemo(
    () =>
      baixas
        .filter((b) => b.nf_numero.startsWith(PREFIXO))
        .slice(0, 15),
    [baixas],
  );

  async function registrarExpedicao(sku: string) {
    const quantidade = num(quantidades[sku]);
    if (!quantidade || quantidade <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setEnviando(sku);
    const agora = new Date();
    const { error } = await supabase.from("pks_estoque_baixas").insert({
      nf_numero: `${PREFIXO}${agora.toISOString()}`,
      nf_data: agora.toLocaleDateString("pt-BR"),
      sku,
      quantidade,
    });
    setEnviando(null);
    if (error) {
      toast.error(`Falha ao registrar expedição: ${error.message}`);
      return;
    }
    setQuantidades((atual) => ({ ...atual, [sku]: "" }));
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success(`${fmtInt(quantidade)} un. de ${sku} expedidas para a Vaeso.`);
  }

  async function estornarExpedicao(id: string, sku: string) {
    if (!window.confirm(`Cancelar esta expedição de ${sku}? A quantidade volta para o Estoque PKS.`)) return;
    const { error } = await supabase.from("pks_estoque_baixas").delete().eq("id", id);
    if (error) {
      toast.error(`Falha ao cancelar: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success("Expedição cancelada.");
  }

  if (!podeEditar) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Seu acesso não permite lançar expedições.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="sticky top-0 z-10 -mx-3 space-y-2 bg-muted px-3 pb-2 pt-1 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <PackageCheck className="size-5 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-bold leading-tight">Expedição</div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              PKS → Vaeso · lança e já baixa do Estoque PKS
            </div>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto por SKU ou descrição..."
            className="h-11 pl-9 text-base"
            inputMode="search"
          />
        </div>
      </div>

      <div className="space-y-2">
        {itens.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-card p-3 shadow-sm active:scale-[0.99] transition-transform"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{item.sku}</div>
                <div className="truncate text-xs text-muted-foreground">{item.descricao || "—"}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] uppercase text-muted-foreground">Saldo PKS</div>
                <div className={`text-sm font-bold ${item.saldo < 0 ? "text-destructive" : ""}`}>
                  {fmtInt(item.saldo)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Quantidade expedida"
                value={quantidades[item.sku] ?? ""}
                onChange={(e) => setQuantidades((atual) => ({ ...atual, [item.sku]: e.target.value }))}
                className="h-11 flex-1 text-right text-base"
              />
              <Button
                className="h-11 px-4"
                disabled={enviando === item.sku || !quantidades[item.sku]}
                onClick={() => void registrarExpedicao(item.sku)}
              >
                {enviando === item.sku ? "..." : "Expedir"}
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        ))}
        {itens.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado.
          </div>
        )}
      </div>

      {expedicoesHoje.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
            <span className="size-2 rounded-[2px] bg-primary" />
            Últimas expedições
          </div>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {expedicoesHoje.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{exp.sku}</div>
                  <div className="text-[11px] text-muted-foreground">{horaBr(exp.created_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{fmtInt(Number(exp.quantidade))}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Cancelar expedição"
                    onClick={() => void estornarExpedicao(exp.id, exp.sku)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

