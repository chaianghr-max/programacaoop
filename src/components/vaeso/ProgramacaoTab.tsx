import { Boxes, Download, FileText, Upload, X } from "lucide-react";
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

  const qtdePorSku = useMemo(() => {
    if (modo === "manual") return dados.manual;
    const map: Record<string, number> = {};
    for (const p of dados.pedidos) {
      for (const item of p.itens ?? []) {
        if (!item.sku) continue;
        const k = item.sku.trim().toUpperCase();
        map[k] = (map[k] ?? 0) + Number(item.qtde || 0);
      }
    }
    return map;
  }, [modo, dados.manual, dados.pedidos]);

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

  const mpTotais = useMemo(() => {
    const base = linhas.filter((l) => l.quantidade > 0);
    return dados.mpItens.map((m) => {
      const chave = m.descricao.trim().toUpperCase();
      const kg = base.reduce((a, l) => a + (l.kgPorMp[chave] ?? 0), 0);
      const valor = num(m.valor_kg);
      return { mp: m.descricao, kg, valor: valor !== null ? kg * valor : null };
    });
  }, [linhas, dados.mpItens]);

  const itensSemSku = useMemo(() => {
    const cadastrados = new Set(dados.skus.map((s) => s.sku.trim().toUpperCase()));
    const out: { pedido: string; nome: string; sku: string | null; qtde: number }[] = [];
    for (const p of dados.pedidos)
      for (const item of p.itens ?? [])
        if (!item.sku || !cadastrados.has(item.sku.trim().toUpperCase()))
          out.push({ pedido: p.numero ?? `slot ${p.slot + 1}`, nome: item.nome, sku: item.sku, qtde: item.qtde });
    return out;
  }, [dados.pedidos, dados.skus]);

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
      className="cursor-pointer select-none px-3 py-2 text-left font-semibold"
      onClick={() => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))}
    >
      {label}
      {ordem.campo === campo ? (ordem.asc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((slot) => {
          const pedido = dados.pedidos.find((p) => p.slot === slot);
          return (
            <div key={slot} className="rounded-lg border border-dashed border-border bg-card p-3">
              {pedido ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">Pedido {pedido.numero ?? "—"}</span>
                    <button
                      aria-label="Remover pedido"
                      onClick={() =>
                        salvar(() => supabase.from("pedidos_importados").delete().eq("slot", slot))
                      }
                    >
                      <X className="size-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <div className="text-muted-foreground">{pedido.fornecedor ?? "Fornecedor —"}</div>
                  <div className="text-muted-foreground">
                    {pedido.data ?? "—"} · {(pedido.itens ?? []).length} itens
                  </div>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => setColando(slot)}
                  >
                    trocar / colar texto
                  </button>
                </div>
              ) : (
                <div className="space-y-2 text-center text-sm text-muted-foreground">
                  <Upload className="mx-auto size-5" />
                  <div>Ordem de Compra {slot + 1}</div>
                  <label className="inline-block cursor-pointer rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                    escolher PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importarPdf(slot, f);
                      }}
                    />
                  </label>
                  <button className="block w-full text-xs text-primary underline" onClick={() => setColando(slot)}>
                    ou colar texto do pedido
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-primary/5 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total de horas de máquina</div>
          <div className="text-3xl font-bold text-primary">{fmt(totalHoras, 1)} h</div>
        </div>
        <div className="rounded-lg border border-border bg-primary/5 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Custo estimado de matéria-prima</div>
          <div className="text-3xl font-bold text-primary">{brl(totalCusto)}</div>
        </div>
      </div>

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
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-left font-semibold">MP</th>
                <th className="px-3 py-2 text-left font-semibold">Produto</th>
                <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                <th className="px-3 py-2 text-left font-semibold">SKUs</th>
                <th className="px-3 py-2 text-right font-semibold">Qtde programada</th>
                <th className="px-3 py-2 text-right font-semibold">Peso (g)</th>
                <th className="px-3 py-2 text-right font-semibold">Consumo MP (kg)</th>
                <th className="px-3 py-2 text-right font-semibold">Cavidades</th>
                <th className="px-3 py-2 text-right font-semibold">Ciclo (s)</th>
                <th className="px-3 py-2 text-right font-semibold">Peças/h</th>
                <th className="px-3 py-2 text-right font-semibold">Horas</th>
              </tr>
            </thead>
            <tbody>
              {linhasEstrutura.map((l) => (
                <tr key={l.key} className="border-t border-border">
                  <td className="px-3 py-1 font-medium">{l.item}</td>
                  <td className="px-3 py-1">{l.mp}</td>
                  <td className="px-3 py-1">{l.produtoNome}</td>
                  <td className="px-3 py-1">{l.tipo}</td>
                  <td className="max-w-[220px] truncate px-3 py-1 text-xs text-muted-foreground" title={l.skus.join(", ")}>
                    {l.skus.join(", ")}
                  </td>
                  <td className="px-3 py-1 text-right">{fmtInt(l.quantidade)}</td>
                  <td className="px-3 py-1 text-right">{fmt(l.pesoG)}</td>
                  <td className="px-3 py-1 text-right">{fmt(l.kg)}</td>
                  <td className="px-3 py-1 text-right">{fmt(l.cavidades, 0)}</td>
                  <td className="px-3 py-1 text-right">{fmt(l.cicloS, 0)}</td>
                  <td className="px-3 py-1 text-right">{fmt(l.ph, 0)}</td>
                  <td className="px-3 py-1 text-right">{fmt(l.horas, 1)}</td>
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
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr>
                {th("tipo", "Tipo")}
                {th("sku", "SKU")}
                {th("descricao", "Descrição")}
                {th("quantidade", "Quantidade")}
                {th("pallet", "% Pallet")}
                {dados.mpItens.map((m) => (
                  <th key={m.id} className="px-3 py-2 text-right font-semibold">
                    {m.descricao} (kg)
                  </th>
                ))}
                {th("horas", "Horas máquina")}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((l) => (
                <tr key={l.sku.id} className="border-t border-border">
                  <td className="px-3 py-1">{l.produto?.tipo ?? "?"}</td>
                  <td className="px-3 py-1 font-medium">{l.sku.sku}</td>
                  <td className="px-3 py-1">{l.sku.descricao}</td>
                  <td className="px-1 py-1 text-right">
                    {modo === "manual" ? (
                      <CellInput
                        type="number"
                        value={dados.manual[l.sku.sku] ?? 0}
                        className="text-right"
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
                  <td className="px-3 py-1 text-right">{l.produto ? fmt(l.pallet, 1) : "-"}</td>
                  {dados.mpItens.map((m) => {
                    const kg = l.kgPorMp[m.descricao.trim().toUpperCase()];
                    return (
                      <td key={m.id} className="px-3 py-1 text-right">
                        {kg ? fmt(kg) : "-"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1 text-right">{fmt(l.horas, 1)}</td>
                  <td className="px-3 py-1 text-right">
                    <button className="text-xs text-primary underline" onClick={() => setDetalhe(l)}>
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
          </table>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">
            Matéria-prima necessária e valor de compra
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1 text-left">Matéria-prima</th>
                <th className="px-3 py-1 text-right">Total (kg)</th>
                <th className="px-3 py-1 text-right">Valor de compra</th>
              </tr>
            </thead>
            <tbody>
              {mpTotais.map((m) => (
                <tr key={m.mp} className="border-t border-border">
                  <td className="px-3 py-1">{m.mp}</td>
                  <td className="px-3 py-1 text-right">{fmt(m.kg)}</td>
                  <td className="px-3 py-1 text-right">{brl(m.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">
            Itens do PDF sem SKU reconhecido
          </div>
          {itensSemSku.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">Nenhum item pendente.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1 text-left">Pedido</th>
                  <th className="px-3 py-1 text-left">Item</th>
                  <th className="px-3 py-1 text-left">SKU</th>
                  <th className="px-3 py-1 text-right">Qtde</th>
                </tr>
              </thead>
              <tbody>
                {itensSemSku.map((i, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-1">{i.pedido}</td>
                    <td className="px-3 py-1">{i.nome}</td>
                    <td className="px-3 py-1">{i.sku ?? "—"}</td>
                    <td className="px-3 py-1 text-right">{fmtInt(i.qtde)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
              <table className="w-full text-sm">
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
                    <tr key={c.comp.id} className="border-t border-border">
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
