import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ChevronDown, ChevronRight, Lock, LockOpen, Plus, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Dados } from "@/lib/vaeso/api";
import { brl, calcularLinhaSku, fmt, fmtInt, num } from "@/lib/vaeso/calc";
import type { LinhaSku } from "@/lib/vaeso/calc";

const PKS = "PKS MANUFATURADOS LTDA";

type PksEntrega = {
  id: string;
  ordem_id: string;
  sku: string;
  quantidade: number;
  status: string;
};

type PksComponenteEntrega = {
  id: string;
  ordem_id: string;
  sku: string;
  componente_id: string;
  quantidade: number;
  status: string;
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
  const [entradas, setEntradas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<LinhaSku | null>(null);
  const [confirmacao, setConfirmacao] = useState<
    { titulo: string; mensagem: string; acao: () => void } | null
  >(null);
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
        .select("id,ordem_id,sku,componente_id,quantidade,status")
        .order("created_at");
      if (error) throw error;
      return data as PksComponenteEntrega[];
    },
  });

  const { data: encerradas = [] } = useQuery({
    queryKey: ["ordens-linhas-encerradas"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_linhas_encerradas")
        .select("ordem_id,sku,encerrada");
      if (error) throw error;
      return data as Array<{ ordem_id: string; sku: string; encerrada: boolean }>;
    },
  });

  const encerradaSet = useMemo(() => {
    const conjunto = new Set<string>();
    for (const item of encerradas) {
      if (item.encerrada) conjunto.add(`${item.ordem_id}|${normalizar(item.sku)}`);
    }
    return conjunto;
  }, [encerradas]);

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

  const ativas = useMemo(
    () => entregas.filter((item) => item.status !== "cancelado"),
    [entregas],
  );
  const componentesAtivos = useMemo(
    () => entregasComponentes.filter((item) => item.status !== "cancelado"),
    [entregasComponentes],
  );

  const totalPrincipal = (ordemId: string, sku: string) =>
    ativas
      .filter((item) => item.ordem_id === ordemId && normalizar(item.sku) === normalizar(sku))
      .reduce((soma, item) => soma + Number(item.quantidade), 0);

  const pendentePrincipal = (ordemId: string, sku: string) =>
    ativas
      .filter(
        (item) =>
          item.status === "pendente" &&
          item.ordem_id === ordemId &&
          normalizar(item.sku) === normalizar(sku),
      )
      .reduce((soma, item) => soma + Number(item.quantidade), 0);

  const totalComponente = (ordemId: string, sku: string, componenteId: string) =>
    componentesAtivos
      .filter(
        (item) =>
          item.ordem_id === ordemId &&
          normalizar(item.sku) === normalizar(sku) &&
          item.componente_id === componenteId,
      )
      .reduce((soma, item) => soma + Number(item.quantidade), 0);

  const totais = useMemo(() => {
    let qtde = 0;
    let entregue = 0;
    let saldo = 0;
    let kg = 0;
    let horas = 0;
    for (const linha of linhas) {
      const feito = Math.min(linha.quantidade, totalPrincipal(linha.ordemId, linha.skuCodigo));
      qtde += linha.quantidade;
      entregue += feito;
      saldo += Math.max(0, linha.quantidade - feito);
      kg += Object.values(linha.calculo.kgPorMp).reduce((soma, valor) => soma + valor, 0);
      horas += linha.calculo.horas ?? 0;
    }
    return { qtde, entregue, saldo, kg, horas };
  }, [linhas, ativas]);

  async function lancarPrincipal(linha: LinhaPks, confirmado = false) {
    const campo = `principal|${linha.key}`;
    const quantidade = Math.max(0, num(entradas[campo]) ?? 0);
    if (!quantidade) return;
    const saldo = Math.max(0, linha.quantidade - totalPrincipal(linha.ordemId, linha.skuCodigo));
    if (!confirmado && quantidade > saldo) {
      setConfirmacao({
        titulo: `Apontar acima do saldo — ${linha.calculo.sku.sku}`,
        mensagem: `Saldo desta linha: ${fmtInt(saldo)}. Você está apontando ${fmtInt(quantidade)}, ${fmtInt(quantidade - saldo)} a mais que o pedido. Deseja prosseguir?`,
        acao: () => void lancarPrincipal(linha, true),
      });
      return;
    }
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

  async function lancarComponente(linha: LinhaPks, componenteId: string, confirmado = false) {
    const campo = `componente|${linha.key}|${componenteId}`;
    const quantidade = Math.max(0, num(entradas[campo]) ?? 0);
    if (!quantidade) return;
    const saldo = Math.max(
      0,
      linha.quantidade - totalComponente(linha.ordemId, linha.skuCodigo, componenteId),
    );
    if (!confirmado && quantidade > saldo) {
      setConfirmacao({
        titulo: "Apontar item acima do saldo",
        mensagem: `Saldo deste item: ${fmtInt(saldo)}. Você está apontando ${fmtInt(quantidade)}, ${fmtInt(quantidade - saldo)} a mais. Deseja prosseguir?`,
        acao: () => void lancarComponente(linha, componenteId, true),
      });
      return;
    }

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


  /** Estorna todos os lançamentos da linha (pendentes e já aceitos na Programação). */
  async function estornarPrincipal(linha: LinhaPks) {
    const alvos = ativas.filter(
      (item) =>
        item.ordem_id === linha.ordemId &&
        normalizar(item.sku) === normalizar(linha.skuCodigo),
    );
    if (alvos.length === 0) {
      toast.info("Não há quantidade lançada para estornar nesta linha.");
      return;
    }
    for (const item of alvos) {
      const { error } = await supabase.rpc("pks_estornar_entrega", { _entrega_id: item.id });
      if (error) {
        toast.error(`Falha ao estornar: ${error.message}`);
        return;
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pks-entregas"] }),
      qc.invalidateQueries({ queryKey: ["ordens-entregas"] }),
      qc.invalidateQueries({ queryKey: ["pks-entregas-aceitas"] }),
    ]);
    toast.success("Quantidade devolvida ao saldo.");
  }

  async function estornarComponente(linha: LinhaPks, componenteId: string) {
    const alvos = componentesAtivos.filter(
      (item) =>
        item.ordem_id === linha.ordemId &&
        normalizar(item.sku) === normalizar(linha.skuCodigo) &&
        item.componente_id === componenteId,
    );
    if (alvos.length === 0) return;
    const { error } = await supabase
      .from("pks_componentes_entregas")
      .update({ status: "cancelado" })
      .in("id", alvos.map((item) => item.id));
    if (error) {
      toast.error(`Falha ao estornar item: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["pks-componentes-entregas"] });
    toast.success("Quantidade do item devolvida ao saldo.");
  }


  /** Encerra (ou reabre) a linha da ordem, mesmo com saldo em aberto. */
  async function alternarEncerramento(linha: LinhaPks) {
    const encerrada = encerradaSet.has(`${linha.ordemId}|${normalizar(linha.skuCodigo)}`);
    const { error } = await supabase.from("ordens_linhas_encerradas").upsert({
      ordem_id: linha.ordemId,
      sku: linha.skuCodigo,
      encerrada: !encerrada,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast.error(`Falha ao encerrar a linha: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["ordens-linhas-encerradas"] });
    toast.success(encerrada ? "Linha reaberta." : "Linha encerrada.");
  }

  const alternarOrdem = (id: string) =>
    setSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    );


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SecaoTitulo>Ordens de compra · PKS Manufaturados</SecaoTitulo>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={ordens.length === 0}
            onClick={() => setSelecionadas(ordens.map((o) => o.id))}
          >
            Selecionar todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selecionadas.length === 0}
            onClick={() => setSelecionadas([])}
          >
            Desmarcar todas
          </Button>
        </div>
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
        <table className="w-full min-w-[1120px] text-xs">
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
              <th className="px-2 py-1.5 text-center uppercase">Cálculo</th>
              <th className="px-2 py-1.5 text-center uppercase">Encerrar</th>
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
                  pendente={pendentePrincipal(linha.ordemId, linha.skuCodigo)}
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
                  onEstornar={() => void estornarPrincipal(linha)}
                  onCalculo={() => setDetalhe(linha.calculo)}
                  encerrada={encerradaSet.has(`${linha.ordemId}|${normalizar(linha.skuCodigo)}`)}
                  onEncerrar={() => void alternarEncerramento(linha)}
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
                      onEstornar: () => void estornarComponente(linha, componente.comp.id),
                    };
                  })}
                />
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot className="sticky bottom-0 bg-secondary font-bold">
              <tr className="border-t-2 border-border">
                <td className="px-1 py-1.5" />
                <td className="px-2 py-1.5 uppercase" colSpan={4}>
                  Total ({linhas.length} itens)
                </td>
                <td className="px-2 py-1.5 text-right">{fmt(totais.kg)} kg</td>
                <td className="px-2 py-1.5 text-right">{fmt(totais.horas, 1)} h</td>
                <td className="px-2 py-1.5 text-right">{fmtInt(totais.qtde)}</td>
                <td className="px-2 py-1.5 text-right">{fmtInt(totais.entregue)}</td>
                <td className="px-2 py-1.5 text-right">{fmtInt(totais.saldo)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              Cálculo — {detalhe?.sku.sku} ({detalhe?.produto?.nome ?? "sem produto vinculado"})
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="max-h-[70vh] space-y-3 overflow-auto px-6 pb-6 text-sm">
              <div className="text-muted-foreground">
                Quantidade da OC: <strong>{fmtInt(detalhe.quantidade)}</strong> · % Pallet:{" "}
                <strong>{fmt(detalhe.pallet, 1)}%</strong>
              </div>
              <div className="overflow-auto rounded-md border border-border">
                <table className="min-w-max whitespace-nowrap text-xs">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Componente</th>
                      <th className="px-2 py-1 text-left">MP</th>
                      <th className="px-2 py-1 text-right">Peso (g)</th>
                      <th className="px-2 py-1 text-right">Consumo (kg)</th>
                      <th className="px-2 py-1 text-right">R$/kg</th>
                      <th className="px-2 py-1 text-right">Custo</th>
                      <th className="px-2 py-1 text-right">Cavidades</th>
                      <th className="px-2 py-1 text-right">Ciclo (s)</th>
                      <th className="px-2 py-1 text-right">Peças/h</th>
                      <th className="px-2 py-1 text-right">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.componentes.map((c) => (
                      <tr key={c.comp.id} className="border-t border-border odd:bg-muted/30">
                        <td className="px-2 py-1">{c.comp.descricao}</td>
                        <td className="px-2 py-1">{c.comp.mp}</td>
                        <td className="px-2 py-1 text-right">{fmt(c.comp.peso_g)}</td>
                        <td className="px-2 py-1 text-right">{fmt(c.kg)}</td>
                        <td className="px-2 py-1 text-right">{fmt(c.valorKg)}</td>
                        <td className="px-2 py-1 text-right">{brl(c.custo)}</td>
                        <td className="px-2 py-1 text-right">
                          {c.comp.cavidades ? fmt(c.comp.cavidades, 0) : "—"}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {c.comp.ciclo_s ? fmt(c.comp.ciclo_s, 1) : "—"}
                        </td>
                        <td className="px-2 py-1 text-right">{fmt(c.ph, 0)}</td>
                        <td className="px-2 py-1 text-right">{fmt(c.horas, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td className="px-2 py-1" colSpan={5}>
                        Total
                      </td>
                      <td className="px-2 py-1 text-right">{brl(detalhe.custo)}</td>
                      <td colSpan={3} />
                      <td className="px-2 py-1 text-right">{fmt(detalhe.horas, 1)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmacao} onOpenChange={(aberto) => !aberto && setConfirmacao(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmacao?.titulo}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmacao?.mensagem}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmacao(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const acao = confirmacao?.acao;
                setConfirmacao(null);
                acao?.();
              }}
            >
              Prosseguir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  onEstornar: () => void;
};

function FragmentoLinha({
  linha,
  aberta,
  produzido,
  pendente,
  saldo,
  consumo,
  campo,
  entrada,
  salvando,
  onToggle,
  onEntrada,
  onLancar,
  onEstornar,
  onCalculo,
  componentes,
}: {
  linha: LinhaPks;
  aberta: boolean;
  produzido: number;
  pendente: number;
  saldo: number;
  consumo: number;
  campo: string;
  entrada: string;
  salvando: string | null;
  onToggle: () => void;
  onEntrada: (valor: string) => void;
  onLancar: () => void;
  onEstornar: () => void;
  onCalculo: () => void;
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
              value={entrada}
              onChange={(evento) => onEntrada(evento.target.value)}
              placeholder="0"
              className="h-7 w-20 text-right font-bold"
            />
            <Button size="icon" className="size-7" disabled={salvando === campo} onClick={onLancar} title="Somar entrega (pode passar da quantidade da OC)">
              <Plus className="size-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="size-7"
              disabled={!produzido && !pendente}
              onClick={onEstornar}
              title="Retornar toda a quantidade entregue desta linha"
            >
              <Undo2 className="size-3" />
            </Button>

          </div>
        </td>
        <td className="bg-secondary/70 px-2 py-1 text-right text-sm font-bold">{fmtInt(saldo)}</td>
        <td className="px-2 py-1 text-center">
          <Button variant="ghost" size="icon" className="size-7" onClick={onCalculo} title="Ver cálculo">
            <Calculator className="size-4" />
          </Button>
        </td>
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
                value={componente.entrada}
                onChange={(evento) => componente.onEntrada(evento.target.value)}
                placeholder="0"
                className="h-7 w-20 text-right font-semibold"
              />
              <Button size="icon" variant="outline" className="size-7" disabled={salvando === componente.campo} onClick={componente.onLancar} title="Somar produção do item (pode passar da quantidade da OC)">
                <Plus className="size-3" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={!componente.feito}
                onClick={componente.onEstornar}
                title="Estornar último lançamento do item"
              >
                <Undo2 className="size-3" />
              </Button>
            </div>
          </td>
          <td className="bg-secondary/40 px-2 py-1 text-right font-bold">{fmtInt(componente.saldo)}</td>
          <td />
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
