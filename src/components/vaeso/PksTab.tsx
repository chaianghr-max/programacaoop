import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Dados } from "@/lib/vaeso/api";
import { calcularLinhaSku, fmt, fmtInt, num } from "@/lib/vaeso/calc";

const PKS = "PKS MANUFATURADOS LTDA";

type PksEntrega = {
  id: string;
  ordem_id: string;
  sku: string;
  quantidade: number;
  status: string;
};

type PksComponenteEntrega = {
  ordem_id: string;
  sku: string;
  componente_id: string;
  quantidade: number;
};

type LinhaPks = {
  key: string;
  ordemId: string;
  numero: string;
  skuCodigo: string;
  quantidade: number;
  calculo: ReturnType<typeof calcularLinhaSku>;
};

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export function PksTab({ dados }: { dados: Dados }) {
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [abertas, setAbertas] = useState<string[]>([]);
  const [entradas, setEntradas] = useState<Record<string, string>>( {} );
  const [salvando, setSalvando] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: entregas = [] } = useQuery({
    queryKey: ["pks-entregas"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pks_entregas")
        .select("id,ordem_id,sku,quantidade,status")
        .order("created_at");
      if (error) throw error;
      return data as PksEntrega[];
    },
  });

  const { data: entregasComponentes = [] } = useQuery({
    queryKey: ["pks-componentes-entregas"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pks_componentes_entregas")
        .select("ordem_id,sku,componente_id,quantidade")
        .order("created_at");
      if (error) throw error;
      return data as PksComponenteEntrega[];
    },
  });

  const ordens = useMemo(
    () =>
      dados.pedidos
        .filter((pedido) => normalizar(pedido.fornecedor ?? "") === PKS)
        .map((pedido) => ({
          id: `p${pedido.slot}`,
          numero: pedido.numero ?? String(pedido.slot),
          data: pedido.data ?? "",
          itens: pedido.itens
            .filter((item) => item.sku)
            .map((item) => ({ sku: String(item.sku), quantidade: Number(item.qtde || 0) })),
        }))
        .sort((a, b) => Number(b.numero) - Number(a.numero)),
    [dados.pedidos],
  );

  const idsAtivos = selecionadas.length > 0 ? selecionadas : ordens.map((ordem) => ordem.id);
  const termo = busca.trim().toLowerCase();

  const linhas = useMemo(() => {
    const resultado: LinhaPks[] = [];
    for (const ordem of ordens) {
      if (!idsAtivos.includes(ordem.id)) continue;
      for (const item of ordem.itens) {
        const sku = dados.skus.find(
          (candidato) => normalizar(candidato.sku) === normalizar(item.sku),
        );
        if (!sku) continue;
        const calculo = calcularLinhaSku(
          sku,
          dados.produtos,
          dados.componentes,
          dados.mpItens,
          item.quantidade,
        );
        if (
          termo &&
          !sku.sku.toLowerCase().includes(termo) &&
          !sku.tipo.toLowerCase().includes(termo) &&
          !sku.descricao.toLowerCase().includes(termo)
        ) continue;
        resultado.push({
          key: `${ordem.id}|${normalizar(item.sku)}`,
          ordemId: ordem.id,
          numero: ordem.numero,
          skuCodigo: item.sku,
          quantidade: item.quantidade,
          calculo,
        });
      }
    }
    return resultado;
  }, [ordens, idsAtivos, dados.skus, dados.produtos, dados.componentes, dados.mpItens, termo]);

  const totalPrincipal = (ordemId: string, sku: string) =>
    entregas
      .filter((item) => item.ordem_id === ordemId && normalizar(item.sku) === normalizar(sku))
      .reduce((soma, item) => soma + Number(item.quantidade), 0);

  const totalComponente = (ordemId: string, sku: string, componenteId: string) =>
    entregasComponentes
      .filter(
        (item) =>
          item.ordem_id === ordemId &&
          normalizar(item.sku) === normalizar(sku) &&
          item.componente_id === componenteId,
      )
      .reduce((soma, item) => soma + Number(item.quantidade), 0);

  async function lancarPrincipal(linha: LinhaPks) {
    const campo = `principal|${linha.key}`;
    const saldo = Math.max(0, linha.quantidade - totalPrincipal(linha.ordemId, linha.skuCodigo));
    const quantidade = Math.min(Math.max(0, num(entradas[campo]) ?? 0), saldo);
    if (!quantidade) return;
    setSalvando(campo);
    const { error } = await supabase.from("pks_entregas").insert({
      ordem_id: linha.ordemId,
      sku: linha.skuCodigo,
      quantidade,
    });
    setSalvando(null);
    if (error) {
      toast.error(`Falha ao lançar entrega: ${error.message}`);
      return;
    }
    setEntradas((atual) => ({ ...atual, [campo]: "" }));
    await qc.invalidateQueries({ queryKey: ["pks-entregas"] });
    toast.success(`${fmtInt(quantidade)} unidades enviadas para confirmação.`);
  }

  async function lancarComponente(linha: LinhaPks, componenteId: string) {
    const campo = `componente|${linha.key}|${componenteId}`;
    const produzido = totalComponente(linha.ordemId, linha.skuCodigo, componenteId);
    const saldo = Math.max(0, linha.quantidade - produzido);
    const quantidade = Math.min(Math.max(0, num(entradas[campo]) ?? 0), saldo);
    if (!quantidade) return;
    setSalvando(campo);
    const { error } = await supabase.from("pks_componentes_entregas").insert({
      ordem_id: linha.ordemId,
      sku: linha.skuCodigo,
      componente_id: componenteId,
      quantidade,
    });
    setSalvando(null);
    if (error) {
      toast.error(`Falha ao lançar item: ${error.message}`);
      return;
    }
    setEntradas((atual) => ({ ...atual, [campo]: "" }));
    await qc.invalidateQueries({ queryKey: ["pks-componentes-entregas"] });
  }

  const alternarOrdem = (id: string) =>
    setSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SecaoTitulo>Ordens de compra · PKS Manufaturados</SecaoTitulo>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelecionadas(selecionadas.length === ordens.length ? [] : ordens.map((o) => o.id))}
        >
          {selecionadas.length === ordens.length && ordens.length > 0 ? "Limpar seleção" : "Selecionar todas"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ordens.map((ordem) => {
          const selecionada = idsAtivos.includes(ordem.id);
          const total = ordem.itens.reduce((soma, item) => soma + item.quantidade, 0);
          const produzido = ordem.itens.reduce(
            (soma, item) => soma + Math.min(item.quantidade, totalPrincipal(ordem.id, item.sku)),
            0,
          );
          const percentual = total ? (produzido / total) * 100 : 0;
          return (
            <Button
              key={ordem.id}
              variant={selecionada ? "default" : "outline"}
              className="h-auto min-w-32 justify-start px-3 py-2 text-left"
              onClick={() => alternarOrdem(ordem.id)}
            >
              <span>
                <strong className="block">OC {ordem.numero}</strong>
                <span className="block text-[10px] font-normal opacity-80">
                  {ordem.itens.length} itens · {fmt(percentual, 0)}% produzido
                </span>
              </span>
            </Button>
          );
        })}
        {ordens.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ordem PKS importada na Programação.</p>
        )}
      </div>

      <Input
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
        placeholder="Buscar por SKU, tipo ou descrição..."
        className="max-w-xs"
      />

      <div className="max-h-[72vh] overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[1050px] text-xs">
          <thead className="sticky top-0 z-10 bg-grid-head text-grid-head-foreground shadow-[0_1px_0_var(--color-border)]">
            <tr>
              <th className="w-8 px-1 py-1.5" />
              <th className="px-2 py-1.5 text-left uppercase">OC</th>
              <th className="px-2 py-1.5 text-left uppercase">Tipo</th>
              <th className="px-2 py-1.5 text-left uppercase">SKU</th>
              <th className="px-2 py-1.5 text-left uppercase">Descrição</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Consumo MP</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Horas máquina</th>
              <th className="bg-secondary px-2 py-1.5 text-right font-bold uppercase">Qtde OC</th>
              <th className="bg-secondary px-2 py-1.5 text-center font-bold uppercase">Entrega</th>
              <th className="bg-secondary px-2 py-1.5 text-right font-bold uppercase">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => {
              const aberta = abertas.includes(linha.key);
              const produzido = totalPrincipal(linha.ordemId, linha.skuCodigo);
              const saldo = Math.max(0, linha.quantidade - produzido);
              const campo = `principal|${linha.key}`;
              const consumo = Object.values(linha.calculo.kgPorMp).reduce((soma, kg) => soma + kg, 0);
              return (
                <FragmentoLinha
                  key={linha.key}
                  linha={linha}
                  aberta={aberta}
                  produzido={produzido}
                  saldo={saldo}
                  consumo={consumo}
                  campo={campo}
                  entrada={entradas[campo] ?? ""}
                  salvando={salvando}
                  onToggle={() =>
                    setAbertas((atual) =>
                      aberta ? atual.filter((item) => item !== linha.key) : [...atual, linha.key],
                    )
                  }
                  onEntrada={(valor) => setEntradas((atual) => ({ ...atual, [campo]: valor }))}
                  onLancar={() => void lancarPrincipal(linha)}
                  componentes={linha.calculo.componentes.map((componente) => {
                    const campoComponente = `componente|${linha.key}|${componente.comp.id}`;
                    const feito = totalComponente(linha.ordemId, linha.skuCodigo, componente.comp.id);
                    return {
                      id: componente.comp.id,
                      descricao: componente.comp.descricao,
                      mp: componente.comp.mp,
                      kg: componente.kg,
                      horas: componente.horas,
                      feito,
                      saldo: Math.max(0, linha.quantidade - feito),
                      campo: campoComponente,
                      entrada: entradas[campoComponente] ?? "",
                      onEntrada: (valor: string) =>
                        setEntradas((atual) => ({ ...atual, [campoComponente]: valor })),
                      onLancar: () => void lancarComponente(linha, componente.comp.id),
                    };
                  })}
                />
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ComponenteLinha = {
  id: string;
  descricao: string;
  mp: string;
  kg: number | null;
  horas: number | null;
  feito: number;
  saldo: number;
  campo: string;
  entrada: string;
  onEntrada: (valor: string) => void;
  onLancar: () => void;
};

function FragmentoLinha({
  linha,
  aberta,
  produzido,
  saldo,
  consumo,
  campo,
  entrada,
  salvando,
  onToggle,
  onEntrada,
  onLancar,
  componentes,
}: {
  linha: LinhaPks;
  aberta: boolean;
  produzido: number;
  saldo: number;
  consumo: number;
  campo: string;
  entrada: string;
  salvando: string | null;
  onToggle: () => void;
  onEntrada: (valor: string) => void;
  onLancar: () => void;
  componentes: ComponenteLinha[];
}) {
  return (
    <>
      <tr className={`border-t border-border even:bg-mp-cell ${saldo === 0 ? "text-muted-foreground" : ""}`}>
        <td className="px-1 py-1 text-center">
          <Button variant="ghost" size="icon" className="size-6" onClick={onToggle} aria-label="Abrir estrutura">
            {aberta ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </td>
        <td className="px-2 py-1 font-semibold">{linha.numero}</td>
        <td className="px-2 py-1">{linha.calculo.sku.tipo}</td>
        <td className="px-2 py-1 font-semibold">{linha.calculo.sku.sku}</td>
        <td className="px-2 py-1">{linha.calculo.sku.descricao}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{fmt(consumo)} kg</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{fmt(linha.calculo.horas, 1)} h</td>
        <td className="bg-secondary/70 px-2 py-1 text-right text-sm font-bold">{fmtInt(linha.quantidade)}</td>
        <td className="bg-secondary/70 px-1 py-1">
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              min="0"
              max={saldo}
              value={entrada}
              onChange={(evento) => onEntrada(evento.target.value)}
              placeholder={fmtInt(produzido)}
              className="h-7 w-20 text-right font-bold"
            />
            <Button size="icon" className="size-7" disabled={!saldo || salvando === campo} onClick={onLancar} title="Somar entrega">
              <Plus className="size-4" />
            </Button>
          </div>
        </td>
        <td className="bg-secondary/70 px-2 py-1 text-right text-sm font-bold">{fmtInt(saldo)}</td>
      </tr>
      {aberta && componentes.map((componente) => (
        <tr key={componente.id} className="border-t border-border bg-muted/40 text-[11px]">
          <td className="px-1 py-1" />
          <td className="px-2 py-1 text-muted-foreground">↳ estrutura</td>
          <td className="px-2 py-1 text-muted-foreground">{componente.mp || "—"}</td>
          <td className="px-2 py-1 text-muted-foreground">—</td>
          <td className="px-2 py-1 font-medium">{componente.descricao}</td>
          <td className="px-2 py-1 text-right text-muted-foreground">{fmt(componente.kg)} kg</td>
          <td className="px-2 py-1 text-right text-muted-foreground">{fmt(componente.horas, 1)} h</td>
          <td className="bg-secondary/40 px-2 py-1 text-right font-bold">{fmtInt(linha.quantidade)}</td>
          <td className="bg-secondary/40 px-1 py-1">
            <div className="flex items-center justify-end gap-1">
              <Input
                type="number"
                min="0"
                max={componente.saldo}
                value={componente.entrada}
                onChange={(evento) => componente.onEntrada(evento.target.value)}
                placeholder={fmtInt(componente.feito)}
                className="h-7 w-20 text-right font-semibold"
              />
              <Button size="icon" variant="outline" className="size-7" disabled={!componente.saldo || salvando === componente.campo} onClick={componente.onLancar} title="Somar produção do item">
                <Plus className="size-3" />
              </Button>
            </div>
          </td>
          <td className="bg-secondary/40 px-2 py-1 text-right font-bold">{fmtInt(componente.saldo)}</td>
        </tr>
      ))}
    </>
  );
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
      <span className="size-2 rounded-[2px] bg-primary" />
      {children}
    </div>
  );
}