import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Check, Download, FileText, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CellInput } from "@/components/vaeso/CellInput";
import { supabase } from "@/integrations/supabase/client";
import type { Dados, Salvar } from "@/lib/vaeso/api";
import {
  brl,
  calcularLinhaSku,
  fmt,
  fmtInt,
  montarEstrutura,
  num,
  type LinhaSku,
} from "@/lib/vaeso/calc";
import { extrairTextoPdf, parsePedidoLinhas, vincularItens } from "@/lib/vaeso/pdf";
import { EMPRESAS_TINY, listarOrdensTiny, type OrdemTiny } from "@/lib/vaeso/tiny.functions";

type Ordenacao = { campo: string; asc: boolean };

export function ProgramacaoTab({
  dados,
  salvar,
}: {
  dados: Dados;
  salvar: Salvar;
}) {
  const [modo, setModo] = useState<"ordem" | "manual">("ordem");
  const [estrutura, setEstrutura] = useState(false);
  const [ocultarZerados, setOcultarZerados] = useState(true);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordenacao>({ campo: "sku", asc: true });
  const [detalhe, setDetalhe] = useState<LinhaSku | null>(null);
  const [colando, setColando] = useState<number | null>(null);
  const [textoColado, setTextoColado] = useState("");
  const [ordemSelId, setOrdemSelId] = useState<string | null>(null);

  const qc = useQueryClient();
  const buscarOrdens = useServerFn(listarOrdensTiny);
  const {
    data: ordensTiny,
    isFetching: carregandoTiny,
    error: erroTiny,
  } = useQuery<OrdemTiny[]>({
    queryKey: ["tiny-ordens"],
    queryFn: () => buscarOrdens(),
    staleTime: 60_000,
  });

  const { data: entregas } = useQuery({
    queryKey: ["ordens-entregas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordens_entregas").select("*");
      if (error) throw error;
      return data as Array<{ ordem_id: string; sku: string; entregue: boolean }>;
    },
  });

  const entregueMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const e of entregas ?? []) if (e.entregue) m[`${e.ordem_id}|${e.sku.toUpperCase()}`] = true;
    return m;
  }, [entregas]);

  const ordemSel = (ordensTiny ?? []).find((o) => o.id === ordemSelId) ?? null;

  const pctEntregue = (o: OrdemTiny) => {
    const total = o.itens.length;
    if (!total) return 0;
    const feitos = o.itens.filter((i) => entregueMap[`${o.id}|${i.codigo.toUpperCase()}`]).length;
    return (feitos / total) * 100;
  };

  async function alternarEntrega(ordemId: string, sku: string, atual: boolean) {
    if (atual) {
      await supabase.from("ordens_entregas").delete().eq("ordem_id", ordemId).eq("sku", sku);
    } else {
      await supabase
        .from("ordens_entregas")
        .upsert({ ordem_id: ordemId, sku, entregue: true, updated_at: new Date().toISOString() });
    }
    void qc.invalidateQueries({ queryKey: ["ordens-entregas"] });
  }

  const qtdePorSku = useMemo(() => {
    if (modo === "manual") return dados.manual;
    const map: Record<string, number> = {};
    if (ordemSel) {
      for (const item of ordemSel.itens) {
        const k = item.codigo.trim().toUpperCase();
        if (!k) continue;
        map[k] = (map[k] ?? 0) + Number(item.quantidade || 0);
      }
      return map;
    }
    for (const p of dados.pedidos) {
      for (const item of p.itens ?? []) {
        if (!item.sku) continue;
        const k = item.sku.trim().toUpperCase();
        map[k] = (map[k] ?? 0) + Number(item.qtde || 0);
      }
    }
    return map;
  }, [modo, dados.manual, dados.pedidos, ordemSel]);


  const linhas = useMemo(
    () =>
      dados.skus.map((s) =>
        calcularLinhaSku(
          s,
          dados.produtos,
          dados.componentes,
          dados.mpItens,
          Number(qtdePorSku[s.sku.trim().toUpperCase()] ?? qtdePorSku[s.sku] ?? 0),
        ),
      ),
    [dados.skus, dados.produtos, dados.componentes, dados.mpItens, qtdePorSku],
  );

  const totalHoras = linhas.reduce((a, l) => a + (l.horas ?? 0), 0);
  const totalCusto = linhas.reduce((a, l) => a + (l.custo ?? 0), 0);

  const termo = busca.trim().toLowerCase();

  const linhasVisiveis = useMemo(() => {
    let out = linhas.filter((l) => (!ocultarZerados || l.quantidade > 0));
    if (termo)
      out = out.filter(
        (l) =>
          l.sku.sku.toLowerCase().includes(termo) ||
          l.sku.descricao.toLowerCase().includes(termo) ||
          l.sku.tipo.toLowerCase().includes(termo),
      );
    const dir = ordem.asc ? 1 : -1;
    const valor = (l: LinhaSku) => {
      switch (ordem.campo) {
        case "tipo":
          return l.sku.tipo;
        case "descricao":
          return l.sku.descricao;
        case "quantidade":
          return l.quantidade;
        case "pallet":
          return l.pallet ?? -1;
        case "horas":
          return l.horas ?? -1;
        default:
          return l.sku.sku;
      }
    };
    return [...out].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [linhas, ocultarZerados, termo, ordem]);

  const linhasEstrutura = useMemo(() => {
    let out = montarEstrutura(
      linhas.filter((l) => !ocultarZerados || l.quantidade > 0),
      dados.componentes,
    );
    if (ocultarZerados) out = out.filter((l) => l.quantidade > 0);
    if (termo) out = out.filter((l) => l.item.toLowerCase().includes(termo));
    return out.sort((a, b) => a.item.localeCompare(b.item));
  }, [linhas, dados.componentes, ocultarZerados, termo]);

  const totaisVisiveis = useMemo(() => {
    const mpKg: Record<string, number> = {};
    for (const m of dados.mpItens) mpKg[m.id] = 0;
    let quantidade = 0;
    let horas = 0;
    let pallets = 0;
    for (const l of linhasVisiveis) {
      quantidade += l.quantidade;
      horas += l.horas ?? 0;
      pallets += (l.pallet ?? 0) / 100;
      for (const m of dados.mpItens) {
        mpKg[m.id] = (mpKg[m.id] ?? 0) + (l.kgPorMp[m.descricao.trim().toUpperCase()] ?? 0);
      }
    }
    return { quantidade, horas, pallets, mpKg };
  }, [linhasVisiveis, dados.mpItens]);


  const totaisEstrutura = useMemo(() => {
    let quantidade = 0;
    let kg = 0;
    let horas = 0;
    for (const l of linhasEstrutura) {
      quantidade += l.quantidade;
      kg += l.kg ?? 0;
      horas += l.horas ?? 0;
    }
    return { quantidade, kg, horas };
  }, [linhasEstrutura]);

  const mpTotais = useMemo(() => {
    const base = linhas.filter((l) => l.quantidade > 0);
    return dados.mpItens.map((m) => {
      const chave = m.descricao.trim().toUpperCase();
      const kg = base.reduce((a, l) => a + (l.kgPorMp[chave] ?? 0), 0);
      const valor = num(m.valor_kg);
      return { mp: m.descricao, kg, valor: valor !== null ? kg * valor : null };
    });
  }, [linhas, dados.mpItens]);

  const mpTotalGeral = useMemo(
    () => ({
      kg: mpTotais.reduce((a, m) => a + m.kg, 0),
      valor: mpTotais.reduce((a, m) => a + (m.valor ?? 0), 0),
    }),
    [mpTotais],
  );




  async function importarPdf(slot: number, file: File) {
    try {
      const linhasTexto = await extrairTextoPdf(file);
      gravarPedido(slot, linhasTexto);
    } catch {
      setColando(slot);
    }
  }

  function gravarPedido(slot: number, linhasTexto: string[]) {
    const parsed = parsePedidoLinhas(linhasTexto);
    const itens = vincularItens(parsed.itens, dados.skus, dados.produtos);
    salvar(() =>
      supabase.from("pedidos_importados").upsert({
        slot,
        numero: parsed.numero,
        data: parsed.data,
        fornecedor: parsed.fornecedor,
        itens: itens as unknown as never,
        importado_em: new Date().toISOString(),
      }),
    );
  }

  function exportarCsv() {
    const sep = ";";
    let head: string[];
    let rows: string[][];
    if (estrutura) {
      head = ["Item", "MP", "Produto", "Tipo", "SKUs", "Qtde", "Peso (g)", "Consumo MP (kg)", "Cavidades", "Ciclo (s)", "Peças/h", "Horas"];
      rows = linhasEstrutura.map((l) => [
        l.item, l.mp, l.produtoNome, l.tipo, l.skus.join(" | "),
        String(l.quantidade), fmt(l.pesoG), fmt(l.kg), fmt(l.cavidades, 0), fmt(l.cicloS), fmt(l.ph, 0), fmt(l.horas),
      ]);
    } else {
      head = ["Tipo", "SKU", "Descrição", "Quantidade", "% Pallet", ...dados.mpItens.map((m) => `${m.descricao} (kg)`), "Horas"];
      rows = linhasVisiveis.map((l) => [
        l.produto?.tipo ?? "?", l.sku.sku, l.sku.descricao, String(l.quantidade), fmt(l.pallet),
        ...dados.mpItens.map((m) => fmt(l.kgPorMp[m.descricao.trim().toUpperCase()] ?? 0)),
        fmt(l.horas),
      ]);
    }
    const csv = [head.join(sep), ...rows.map((r) => r.join(sep))].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `programacao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarPdf() {
    window.print();
  }

  const th = (campo: string, label: string) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase"
      onClick={() => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))}
    >
      {label}
      {ordem.campo === campo ? (ordem.asc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SecaoTitulo>Ordens de compra em aberto (Tiny)</SecaoTitulo>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent">
            importar PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importarPdf(0, f);
              }}
            />
          </label>
          <button className="text-[11px] text-primary underline" onClick={() => setColando(0)}>
            colar texto
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void qc.invalidateQueries({ queryKey: ["tiny-ordens"] })}
          >
            <RefreshCw className={`mr-1 size-4 ${carregandoTiny ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {erroTiny && (
        <p className="text-xs text-destructive">Não foi possível carregar as ordens do Tiny.</p>
      )}
      {carregandoTiny && !ordensTiny && (
        <p className="text-xs text-muted-foreground">Carregando ordens do Tiny...</p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {EMPRESAS_TINY.map((empresa) => {
          const lista = (ordensTiny ?? []).filter((o) => o.empresa === empresa);
          return (
            <div key={empresa} className="rounded-lg border border-border bg-card p-2">
              <div className="mb-2 truncate text-[11px] font-bold uppercase tracking-wide text-primary" title={empresa}>
                {empresa}
              </div>
              {lista.length === 0 ? (
                <div className="px-1 py-2 text-[11px] text-muted-foreground">Sem ordens em aberto.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {lista.map((o) => {
                    const pct = pctEntregue(o);
                    const sel = ordemSelId === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setOrdemSelId(sel ? null : o.id)}
                        className={`min-w-[104px] rounded-md border px-2 py-1 text-left transition-colors ${
                          sel
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                      >
                        <div className="text-sm font-bold leading-tight">Nº {o.numero}</div>
                        <div className="text-[10px] opacity-80">
                          {o.data} · {o.itens.length} itens
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                          <div
                            className={`h-full ${sel ? "bg-primary-foreground" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-semibold">{fmt(pct, 0)}% entregue</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>


      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          <div className="text-xl font-bold leading-tight">{fmt(totalHoras, 1)} h</div>
          <div className="text-[10px] uppercase tracking-wide opacity-90">Total de horas de máquina</div>
        </div>
        <div className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          <div className="text-xl font-bold leading-tight">{brl(totalCusto)}</div>
          <div className="text-[10px] uppercase tracking-wide opacity-90">Custo estimado de matéria-prima</div>
        </div>
      </div>

      <SecaoTitulo>{estrutura ? "Estrutura de itens" : "Produtos por SKU"}</SecaoTitulo>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["ordem", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase ${
                modo === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
              }`}
            >
              {m === "ordem" ? "Ordem de produção" : "Programação manual"}
            </button>
          ))}
        </div>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={estrutura ? "Buscar item da estrutura (ex: vedação)..." : "Buscar por SKU, tipo ou descrição..."}
          className="max-w-xs"
        />
        <Button variant={estrutura ? "default" : "outline"} size="sm" onClick={() => setEstrutura((v) => !v)}>
          <Boxes className="mr-1 size-4" /> Estrutura
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOcultarZerados((v) => !v)}>
          {ocultarZerados ? "mostrar zerados" : "ocultar zerados"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportarCsv}>
          <Download className="mr-1 size-4" /> Excel (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf}>
          <FileText className="mr-1 size-4" /> PDF
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {estrutura ? (
          <table className="w-full text-xs">
            <thead className="bg-grid-head text-grid-head-foreground">
              <tr>
                {[
                  "Item",
                  "MP",
                  "Produto",
                  "Tipo",
                  "SKUs vinculados",
                  "Quantidade programada",
                  "Peso (g)",
                  "Consumo MP (kg)",
                  "Cavidades",
                  "Ciclo (s)",
                  "Peças/h",
                  "Consumo hora",
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasEstrutura.map((l) => (
                <tr key={l.key} className="border-t border-border even:bg-mp-cell hover:bg-muted/40">
                  <td className="whitespace-nowrap px-2 py-1 font-bold">{l.item}</td>
                  <td className="px-2 py-1">
                    {l.mp ? (
                      <span className="rounded bg-mp-head px-1.5 py-0.5 text-[10px] font-bold uppercase text-mp-head-foreground">
                        {l.mp}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1">{l.produtoNome}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-medium">{l.tipo}</td>
                  <td
                    className="max-w-[240px] truncate px-2 py-1 text-[11px] text-muted-foreground"
                    title={l.skus.join(", ")}
                  >
                    {l.skus.join(", ")}
                  </td>
                  <td className="px-2 py-1 font-bold">{fmtInt(l.quantidade)}</td>
                  <td className="px-2 py-1">{fmt(l.pesoG)}</td>
                  <td className="bg-mp-cell px-2 py-1 font-bold">{fmt(l.kg)}</td>
                  <td className="px-2 py-1">{fmt(l.cavidades, 0)}</td>
                  <td className="px-2 py-1">{fmt(l.cicloS, 0)}</td>
                  <td className="px-2 py-1">{fmt(l.ph, 0)}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-bold">
                    {l.horas ? `${fmt(l.horas, 1)} h` : "-"}
                  </td>
                </tr>
              ))}
              {linhasEstrutura.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                    Nada para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
            {linhasEstrutura.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary font-bold text-secondary-foreground">
                  <td className="whitespace-nowrap px-2 py-1.5 uppercase" colSpan={5}>
                    Total ({linhasEstrutura.length} itens)
                  </td>
                  <td className="px-2 py-1.5">{fmtInt(totaisEstrutura.quantidade)}</td>
                  <td className="px-2 py-1.5" />
                  <td className="bg-mp-cell px-2 py-1.5">{fmt(totaisEstrutura.kg)}</td>
                  <td className="px-2 py-1.5" colSpan={3} />
                  <td className="whitespace-nowrap px-2 py-1.5">{fmt(totaisEstrutura.horas, 1)} h</td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-grid-head text-grid-head-foreground">
              <tr>
                <th className="px-2 py-1" colSpan={5} />
                <th
                  className="border-x border-border bg-mp-head px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-mp-head-foreground"
                  colSpan={dados.mpItens.length}
                >
                  Consumo MP (kg)
                </th>
                <th className="px-2 py-1" colSpan={2} />
              </tr>
              <tr>
                {th("tipo", "Tipo")}
                {th("sku", "SKU")}
                {th("descricao", "Descrição")}
                {th("quantidade", "Quantidade")}
                {th("pallet", "% Pallet")}
                {dados.mpItens.map((m) => (
                  <th
                    key={m.id}
                    className="whitespace-nowrap bg-mp-head px-2 py-1.5 text-right text-[11px] font-bold uppercase text-mp-head-foreground"
                  >
                    {m.descricao}
                  </th>
                ))}
                {th("horas", "Horas máquina")}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((l) => (
                <tr key={l.sku.id} className="border-t border-border even:bg-mp-cell">
                  <td className="px-2 py-0.5">{l.produto?.tipo ?? "?"}</td>
                  <td className="px-2 py-0.5 font-medium">{l.sku.sku}</td>
                  <td className="px-2 py-0.5">{l.sku.descricao}</td>
                  <td className="px-1 py-0.5 text-right font-bold">
                    {modo === "manual" ? (
                      <CellInput
                        type="number"
                        value={dados.manual[l.sku.sku] ?? 0}
                        className="text-right font-bold"
                        onCommit={(v) =>
                          salvar(() =>
                            supabase
                              .from("programacao_manual")
                              .upsert({ sku: l.sku.sku, quantidade: num(v) ?? 0, updated_at: new Date().toISOString() }),
                          )
                        }
                      />
                    ) : (
                      fmtInt(l.quantidade)
                    )}
                  </td>
                  <td className="px-2 py-0.5 text-right">{l.produto ? fmt(l.pallet, 1) : "-"}</td>
                  {dados.mpItens.map((m) => {
                    const kg = l.kgPorMp[m.descricao.trim().toUpperCase()];
                    return (
                      <td key={m.id} className="bg-mp-cell px-2 py-0.5 text-right">
                        {kg ? fmt(kg) : "-"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-0.5 text-right">{fmt(l.horas, 1)}</td>
                  <td className="px-2 py-0.5 text-right">
                    <button
                      className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent"
                      onClick={() => setDetalhe(l)}
                    >
                      ver cálculo
                    </button>
                  </td>
                </tr>
              ))}
              {linhasVisiveis.length === 0 && (
                <tr>
                  <td colSpan={6 + dados.mpItens.length} className="px-3 py-6 text-center text-muted-foreground">
                    Nada para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
            {linhasVisiveis.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary font-bold text-secondary-foreground">
                  <td className="whitespace-nowrap px-2 py-1.5 uppercase" colSpan={3}>
                    Total ({linhasVisiveis.length} itens)
                  </td>
                  <td className="px-2 py-1.5 text-right">{fmtInt(totaisVisiveis.quantidade)}</td>
                  <td className="px-2 py-1.5" />
                  {dados.mpItens.map((m) => (
                    <td key={m.id} className="bg-mp-cell px-2 py-1.5 text-right">
                      {totaisVisiveis.mpKg[m.id] ? fmt(totaisVisiveis.mpKg[m.id]) : "-"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">{fmt(totaisVisiveis.horas, 1)}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      <div className="grid gap-4">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">
            Matéria-prima necessária e valor de compra
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-0.5 text-left">Matéria-prima</th>
                <th className="px-2 py-0.5 text-right">Total (kg)</th>
                <th className="px-2 py-0.5 text-right">Valor de compra</th>
              </tr>
            </thead>
            <tbody>
              {mpTotais.map((m) => (
                <tr key={m.mp} className="border-t border-border odd:bg-muted/30">
                  <td className="px-2 py-0.5">{m.mp}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(m.kg)}</td>
                  <td className="px-2 py-0.5 text-right">{brl(m.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Cálculo — {detalhe?.sku.sku} ({detalhe?.produto?.nome ?? "sem produto vinculado"})
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-3 text-sm">
              <div className="text-muted-foreground">
                Quantidade programada: <strong>{fmtInt(detalhe.quantidade)}</strong> · Sugerida (caixas
                completas): <strong>{fmtInt(detalhe.sugerida)}</strong> · % Pallet:{" "}
                <strong>{fmt(detalhe.pallet, 1)}%</strong>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Componente</th>
                    <th className="px-2 py-1 text-left">MP</th>
                    <th className="px-2 py-1 text-right">Peso (g)</th>
                    <th className="px-2 py-1 text-right">Consumo (kg)</th>
                    <th className="px-2 py-1 text-right">R$/kg</th>
                    <th className="px-2 py-1 text-right">Custo</th>
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
                    <td />
                    <td className="px-2 py-1 text-right">{fmt(detalhe.horas, 1)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={colando !== null} onOpenChange={(v) => !v && setColando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Colar texto da Ordem de Compra</DialogTitle>
          </DialogHeader>
          <textarea
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            rows={12}
            placeholder="Cole aqui o texto do PDF do pedido (Tiny)..."
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
          />
          <Button
            onClick={() => {
              if (colando === null) return;
              gravarPedido(colando, textoColado.split("\n"));
              setTextoColado("");
              setColando(null);
            }}
          >
            Importar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
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
