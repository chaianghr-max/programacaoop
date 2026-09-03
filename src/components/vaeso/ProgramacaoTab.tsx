import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Check, Download, FileText, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";


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
import {
  EMPRESAS_TINY,
  listarOrdensTiny,
  urlAutorizacaoTiny,
  type OrdemTiny,
} from "@/lib/vaeso/tiny.functions";

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
  const [colando, setColando] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [empresaNova, setEmpresaNova] = useState<string>(EMPRESAS_TINY[0]);
  const [numeroNovo, setNumeroNovo] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  const qc = useQueryClient();
  const buscarOrdens = useServerFn(listarOrdensTiny);
  const obterUrlAuth = useServerFn(urlAutorizacaoTiny);

  // Integração automática com o Tiny fica pronta, porém desligada até o app
  // OAuth do Tiny existir (é necessário cadastrar a URL de retorno lá).
  const TINY_ATIVO = false;

  async function conectarTiny() {
    const url = await obterUrlAuth({
      data: { redirectUri: `${window.location.origin}/tiny-callback` },
    });
    window.location.href = url;
  }
  const { data: ordensTiny } = useQuery<OrdemTiny[]>({
    queryKey: ["tiny-ordens"],
    queryFn: () => buscarOrdens(),
    staleTime: 60_000,
    enabled: TINY_ATIVO,
  });

  const { data: entregas } = useQuery({
    queryKey: ["ordens-entregas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordens_entregas").select("*");
      if (error) throw error;
      return data as Array<{
        ordem_id: string;
        sku: string;
        entregue: boolean;
        qtde_entregue: number | null;
      }>;
    },
  });

  // quantidade já entregue por ordem+sku
  const entregueMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entregas ?? []) {
      const q = Number(e.qtde_entregue ?? 0);
      m[`${e.ordem_id}|${e.sku.toUpperCase()}`] = q > 0 ? q : e.entregue ? -1 : 0;
    }
    return m;
  }, [entregas]);


  type OrdemPainel = {
    id: string;
    numero: string;
    empresa: string;
    data: string;
    slot: number | null;
    itens: Array<{ codigo: string; quantidade: number }>;
  };

  const ordens: OrdemPainel[] = useMemo(() => {
    const manuais: OrdemPainel[] = (dados.pedidos ?? []).map((p) => ({
      id: `p${p.slot}`,
      numero: p.numero ?? String(p.slot),
      empresa: p.fornecedor ?? "",
      data: p.data ?? "",
      slot: p.slot,
      itens: (p.itens ?? [])
        .filter((i) => !!i.sku)
        .map((i) => ({ codigo: String(i.sku), quantidade: Number(i.qtde || 0) })),
    }));
    const doTiny: OrdemPainel[] = (ordensTiny ?? []).map((o) => ({
      id: o.id,
      numero: o.numero,
      empresa: o.empresa,
      data: o.data,
      slot: null,
      itens: o.itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),
    }));
    return [...manuais, ...doTiny].sort((a, b) => Number(b.numero) - Number(a.numero));
  }, [dados.pedidos, ordensTiny]);

  const ordensSel = useMemo(
    () => ordens.filter((o) => selecionadas.includes(o.id)),
    [ordens, selecionadas],
  );
  const temSelecao = ordensSel.length > 0;

  // quantidade entregue de um item de uma ordem (-1 = legado "entregue total")
  const qtdeEntregueItem = (ordemId: string, codigo: string, qtde: number) => {
    const v = entregueMap[`${ordemId}|${codigo.trim().toUpperCase()}`] ?? 0;
    return v === -1 ? qtde : Math.min(v, qtde);
  };

  const pctEntregue = (o: OrdemPainel) => {
    const total = o.itens.reduce((s, i) => s + Number(i.quantidade || 0), 0);
    if (!total) return 0;
    const feitos = o.itens.reduce((s, i) => s + qtdeEntregueItem(o.id, i.codigo, i.quantidade), 0);
    return Math.min(100, (feitos / total) * 100);
  };


  function alternarOrdem(id: string) {
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function alternarEmpresa(empresa: string) {
    const ids = ordens.filter((o) => o.empresa === empresa).map((o) => o.id);
    const todas = ids.length > 0 && ids.every((id) => selecionadas.includes(id));
    setSelecionadas((s) => (todas ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]));
  }

  function excluirOrdem(o: OrdemPainel) {
    if (o.slot === null) return;
    const slot = o.slot;
    setSelecionadas((s) => s.filter((x) => x !== o.id));
    salvar(async () => {
      await supabase.from("ordens_entregas").delete().eq("ordem_id", o.id);
      void qc.invalidateQueries({ queryKey: ["ordens-entregas"] });
      return supabase.from("pedidos_importados").delete().eq("slot", slot);
    });
  }


  // grava a quantidade entregue de um SKU, distribuindo entre as ordens selecionadas
  async function definirEntrega(sku: string, quantidade: number) {
    const chave = sku.trim().toUpperCase();
    const alvo = ordensSel.filter((o) => o.itens.some((i) => i.codigo.trim().toUpperCase() === chave));
    let restante = Math.max(0, quantidade);
    for (const o of alvo) {
      const item = o.itens.find((i) => i.codigo.trim().toUpperCase() === chave)!;
      const aplicar = Math.min(restante, Number(item.quantidade || 0));
      restante -= aplicar;
      if (aplicar <= 0) {
        await supabase.from("ordens_entregas").delete().eq("ordem_id", o.id).eq("sku", item.codigo);
      } else {
        await supabase.from("ordens_entregas").upsert({
          ordem_id: o.id,
          sku: item.codigo,
          entregue: aplicar >= Number(item.quantidade || 0),
          qtde_entregue: aplicar,
          updated_at: new Date().toISOString(),
        });
      }
    }
    void qc.invalidateQueries({ queryKey: ["ordens-entregas"] });
  }


  const qtdePorSku = useMemo(() => {
    if (modo === "manual") return dados.manual;
    const map: Record<string, number> = {};
    const base = ordensSel.length > 0 ? ordensSel : [];
    for (const o of base) {
      for (const item of o.itens) {
        const k = item.codigo.trim().toUpperCase();
        if (!k) continue;
        map[k] = (map[k] ?? 0) + Number(item.quantidade || 0);
      }
    }
    return map;
  }, [modo, dados.manual, ordensSel]);



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

  const totaisEntrega = useMemo(() => {
    let entregue = 0;
    let saldo = 0;
    for (const l of linhasVisiveis) {
      const chave = l.sku.sku.trim().toUpperCase();
      let e = 0;
      for (const o of ordensSel) {
        const item = o.itens.find((i) => i.codigo.trim().toUpperCase() === chave);
        if (item) e += qtdeEntregueItem(o.id, item.codigo, Number(item.quantidade || 0));
      }
      entregue += e;
      saldo += Math.max(0, l.quantidade - e);
    }
    return { entregue, saldo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasVisiveis, ordensSel, entregueMap]);



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




  const proximoSlot = () =>
    (dados.pedidos ?? []).reduce((a, p) => Math.max(a, p.slot), -1) + 1;

  async function importarPdf(file: File) {
    const id = toast.loading("Lendo PDF...");
    try {
      const linhasTexto = await extrairTextoPdf(file);
      toast.dismiss(id);
      await gravarPedido(linhasTexto);
    } catch (e) {
      toast.dismiss(id);
      toast.error(
        `Não consegui ler o PDF (${e instanceof Error ? e.message : "erro"}). Cole o texto da ordem.`,
      );
      setColando(true);
    }
  }

  async function gravarPedido(linhasTexto: string[]) {
    const parsed = parsePedidoLinhas(linhasTexto);
    const itens = vincularItens(parsed.itens, dados.skus, dados.produtos);
    const comSku = itens.filter((i) => !!i.sku).length;
    if (itens.length === 0) {
      toast.error("Nenhum item reconhecido nesse arquivo. Verifique o PDF ou cole o texto.");
      return;
    }
    const slot = proximoSlot();
    const { error } = await supabase.from("pedidos_importados").upsert({
      slot,
      numero: numeroNovo.trim() || parsed.numero,
      data: parsed.data,
      fornecedor: empresaNova,
      itens: itens as unknown as never,
      importado_em: new Date().toISOString(),
    });
    if (error) {
      toast.error(`Falha ao salvar a ordem: ${error.message}`);
      return;
    }
    setNumeroNovo("");
    setSelecionadas((s) => [...new Set([...s, `p${slot}`])]);
    void qc.invalidateQueries({ queryKey: ["vaeso"] });
    toast.success(
      `Ordem importada: ${itens.length} itens (${comSku} com SKU reconhecido).`,
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SecaoTitulo>Ordens de compra em aberto</SecaoTitulo>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={empresaNova}
            onChange={(e) => setEmpresaNova(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
          >
            {EMPRESAS_TINY.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <Input
            value={numeroNovo}
            onChange={(e) => setNumeroNovo(e.target.value)}
            placeholder="Nº da ordem"
            className="h-7 w-28 text-[11px]"
          />
          <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent">
            importar PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importarPdf(f);
                e.target.value = "";
              }}
            />
          </label>
          <button className="text-[11px] text-primary underline" onClick={() => setColando(true)}>
            colar texto
          </button>
          {TINY_ATIVO && (
            <Button variant="outline" size="sm" onClick={() => void conectarTiny()}>
              <RefreshCw className="mr-1 size-4" /> Conectar Tiny
            </Button>
          )}
          {selecionadas.length > 0 && (
            <button
              className="text-[11px] text-muted-foreground underline"
              onClick={() => setSelecionadas([])}
            >
              limpar seleção
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {EMPRESAS_TINY.map((empresa) => {
          const lista = ordens.filter((o) => o.empresa === empresa);
          const todas = lista.length > 0 && lista.every((o) => selecionadas.includes(o.id));
          return (
            <div key={empresa} className="rounded-lg border border-border bg-card p-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div
                  className="truncate text-[11px] font-bold uppercase tracking-wide text-primary"
                  title={empresa}
                >
                  {empresa}
                </div>
                <button
                  disabled={lista.length === 0}
                  onClick={() => alternarEmpresa(empresa)}
                  className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase hover:bg-accent disabled:opacity-40"
                >
                  {todas ? "limpar todas" : "selecionar todas"}
                </button>
              </div>
              {lista.length === 0 ? (
                <div className="px-1 py-2 text-[11px] text-muted-foreground">Sem ordens em aberto.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {lista.map((o) => {
                    const pct = pctEntregue(o);
                    const sel = selecionadas.includes(o.id);
                    return (
                      <div
                        key={o.id}
                        className={`relative min-w-[112px] rounded-md border transition-colors ${
                          sel
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                      >
                        <button
                          onClick={() => alternarOrdem(o.id)}
                          className="block w-full px-2 py-1 text-left"
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
                        {o.slot !== null && (
                          <button
                            title="excluir ordem"
                            onClick={() => excluirOrdem(o)}
                            className="absolute right-0.5 top-0.5 rounded px-1 text-[10px] font-bold opacity-60 hover:opacity-100"
                          >
                            ×
                          </button>
                        )}
                      </div>
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

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-card">
        {estrutura ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-grid-head text-grid-head-foreground shadow-[0_1px_0_var(--color-border)]">

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
            <thead className="sticky top-0 z-10 bg-grid-head text-grid-head-foreground shadow-[0_1px_0_var(--color-border)]">
              <tr>
                <th className="bg-grid-head px-2 py-1" colSpan={temSelecao ? 7 : 5} />
                <th
                  className="border-x border-border bg-mp-head px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-mp-head-foreground"
                  colSpan={dados.mpItens.length}
                >
                  Consumo MP (kg)
                </th>
                <th className="bg-grid-head px-2 py-1" colSpan={2} />
              </tr>
              <tr>
                {th("tipo", "Tipo")}
                {th("sku", "SKU")}
                {th("descricao", "Descrição")}
                {temSelecao && (
                  <th className="whitespace-nowrap bg-grid-head px-2 py-1.5 text-center text-[11px] font-bold uppercase">
                    Entrega
                  </th>
                )}
                {th("quantidade", "Quantidade")}
                {temSelecao && (
                  <th className="whitespace-nowrap bg-grid-head px-2 py-1.5 text-right text-[11px] font-bold uppercase">
                    Saldo
                  </th>
                )}
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
                <th className="bg-grid-head px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((l) => {
                const chaveSku = l.sku.sku.trim().toUpperCase();
                const alvos = ordensSel.filter((o) =>
                  o.itens.some((i) => i.codigo.trim().toUpperCase() === chaveSku),
                );
                const entregueQtde = alvos.reduce((s, o) => {
                  const item = o.itens.find((i) => i.codigo.trim().toUpperCase() === chaveSku)!;
                  return s + qtdeEntregueItem(o.id, item.codigo, Number(item.quantidade || 0));
                }, 0);
                const saldo = Math.max(0, l.quantidade - entregueQtde);
                const entregue = alvos.length > 0 && l.quantidade > 0 && saldo === 0;
                const parcial = entregueQtde > 0 && !entregue;
                return (
                  <tr
                    key={l.sku.id}
                    className={`border-t border-border ${
                      entregue ? "bg-muted text-muted-foreground opacity-70" : "even:bg-mp-cell"
                    }`}
                  >
                    <td className="px-2 py-0.5">{l.produto?.tipo ?? "?"}</td>
                    <td className="px-2 py-0.5 font-medium">{l.sku.sku}</td>
                    <td className="px-2 py-0.5">{l.sku.descricao}</td>
                    {temSelecao && (
                      <td className="px-1 py-0.5">
                        <div className="flex items-center justify-end gap-1">
                          <CellInput
                            type="number"
                            value={entregueQtde}
                            placeholder="0"
                            className={`w-16 border-border text-right text-[11px] font-semibold ${
                              parcial ? "text-primary" : ""
                            }`}
                            onCommit={(v) =>
                              void definirEntrega(l.sku.sku, Math.min(num(v) ?? 0, l.quantidade))
                            }
                          />
                          <button
                            title={entregue ? "Zerar entrega" : "Entregar tudo"}
                            onClick={() =>
                              void definirEntrega(l.sku.sku, entregue ? 0 : l.quantidade)
                            }
                            className={`inline-flex items-center rounded border px-1 py-0.5 text-[10px] font-semibold ${
                              entregue
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background hover:bg-accent"
                            }`}
                          >
                            <Check className="size-3" />
                          </button>
                        </div>
                      </td>
                    )}
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
                    {temSelecao && (
                      <td
                        className={`px-2 py-0.5 text-right font-semibold ${
                          saldo === 0 ? "text-muted-foreground" : ""
                        }`}
                      >
                        {fmtInt(saldo)}
                      </td>
                    )}
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
                );
              })}
              {linhasVisiveis.length === 0 && (
                <tr>
                  <td
                    colSpan={7 + dados.mpItens.length + (temSelecao ? 2 : 0)}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
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
                  {temSelecao && (
                    <td className="px-2 py-1.5 text-right">{fmtInt(totaisEntrega.entregue)}</td>
                  )}
                  <td className="px-2 py-1.5 text-right">{fmtInt(totaisVisiveis.quantidade)}</td>
                  {temSelecao && (
                    <td className="px-2 py-1.5 text-right">{fmtInt(totaisEntrega.saldo)}</td>
                  )}
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {fmt(totaisVisiveis.pallets, 2)} pallets
                  </td>
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
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary font-bold text-secondary-foreground">
                <td className="px-2 py-1.5 uppercase">Total geral</td>
                <td className="px-2 py-1.5 text-right">{fmt(mpTotalGeral.kg)}</td>
                <td className="px-2 py-1.5 text-right">{brl(mpTotalGeral.valor)}</td>
              </tr>
            </tfoot>

          </table>
        </div>

      </div>

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              Cálculo — {detalhe?.sku.sku} ({detalhe?.produto?.nome ?? "sem produto vinculado"})
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="max-h-[70vh] space-y-3 overflow-auto px-6 pb-6 text-sm">
              <div className="text-muted-foreground">
                Quantidade programada: <strong>{fmtInt(detalhe.quantidade)}</strong> · Sugerida (caixas
                completas): <strong>{fmtInt(detalhe.sugerida)}</strong> · % Pallet:{" "}
                <strong>{fmt(detalhe.pallet, 1)}%</strong>
              </div>
              <div className="overflow-auto rounded-md border border-border">
                <table className="min-w-max whitespace-nowrap text-xs">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-1 text-left">Componente</th>
                      <th className="whitespace-nowrap px-2 py-1 text-left">MP</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Peso (g)</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Consumo (kg)</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">R$/kg</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Custo</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Cavidades</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Ciclo (s)</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Peças/h</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.componentes.map((c) => (
                      <tr key={c.comp.id} className="border-t border-border odd:bg-muted/30">
                        <td className="whitespace-nowrap px-2 py-1">{c.comp.descricao}</td>
                        <td className="whitespace-nowrap px-2 py-1">{c.comp.mp}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{fmt(c.comp.peso_g)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{fmt(c.kg)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{fmt(c.valorKg)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{brl(c.custo)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">
                          {c.comp.cavidades ? fmt(c.comp.cavidades, 0) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">
                          {c.comp.ciclo_s ? fmt(c.comp.ciclo_s, 1) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{fmt(c.ph, 0)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{fmt(c.horas, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td className="whitespace-nowrap px-2 py-1" colSpan={5}>
                        Total
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">{brl(detalhe.custo)}</td>
                      <td />
                      <td className="whitespace-nowrap px-2 py-1 text-right">{fmt(detalhe.horas, 1)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={colando} onOpenChange={(v) => !v && setColando(false)}>
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
              void gravarPedido(textoColado.split("\n"));
              setTextoColado("");
              setColando(false);
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
