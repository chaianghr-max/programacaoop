import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CellInput } from "@/components/vaeso/CellInput";
import { supabase } from "@/integrations/supabase/client";
import { novoId, type Dados, type Salvar } from "@/lib/vaeso/api";
import { brl, consumoKg, fmt, num, pecasHora, resolveValorKg } from "@/lib/vaeso/calc";

export function ProdutosTab({ dados, salvar }: { dados: Dados; salvar: Salvar }) {
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const termo = busca.trim().toLowerCase();

  const produtos = dados.produtos.filter(
    (p) => !termo || p.nome.toLowerCase().includes(termo) || p.tipo.toLowerCase().includes(termo),
  );

  const atualizarProduto = (id: string, campo: string, valor: unknown) =>
    salvar(() => supabase.from("produtos").update({ [campo]: valor } as never).eq("id", id));

  const atualizarComp = (id: string, campo: string, valor: unknown) =>
    salvar(() => supabase.from("componentes").update({ [campo]: valor } as never).eq("id", id));

  async function enviarImagem(produtoId: string, file: File) {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 600;
          const escala = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => resolve(null);
        img.src = String(reader.result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (dataUrl) atualizarProduto(produtoId, "imagem", dataUrl);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          onClick={() =>
            salvar(() =>
              supabase.from("produtos").insert({ id: novoId("p"), nome: "NOVO PRODUTO", tipo: "" }),
            )
          }
        >
          <Plus className="mr-1 size-4" /> novo produto
        </Button>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por descrição ou tipo..."
          className="h-8 max-w-xs text-xs"
        />
      </div>

      <div className="space-y-4">
        {produtos.map((p) => {
          const comps = dados.componentes.filter((c) => c.produto_id === p.id);
          const aberto = !fechados[p.id];
          const meio = Math.floor(Math.max(comps.length - 1, 0) / 2);
          return (
            <div key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
                <button
                  onClick={() => setFechados((s) => ({ ...s, [p.id]: aberto }))}
                  className="text-muted-foreground"
                  aria-label={aberto ? "Recolher" : "Expandir"}
                >
                  {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>

                <div className="group relative">
                  {p.imagem ? (
                    <>
                      <img
                        src={p.imagem}
                        alt={p.nome}
                        className="size-11 rounded-md border border-border bg-background object-contain"
                      />
                      <img
                        src={p.imagem}
                        alt=""
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-0 z-50 hidden size-64 rounded-lg border border-border bg-card object-contain p-2 shadow-xl group-hover:block"
                      />
                    </>
                  ) : (
                    <div className="flex size-11 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
                      sem foto
                    </div>
                  )}
                </div>

                <CellInput
                  value={p.nome}
                  onCommit={(v) => atualizarProduto(p.id, "nome", v)}
                  className="w-64 shrink-0 rounded-md bg-primary/10 text-sm font-bold"
                />

                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {comps.length} componentes
                </span>
                <CellInput
                  value={p.tipo}
                  onCommit={(v) => atualizarProduto(p.id, "tipo", v)}
                  className="w-24 rounded-full bg-muted px-2 text-center text-[11px] font-semibold"
                />

                <div className="ml-auto flex items-center gap-3">
                  <label className="cursor-pointer text-xs text-primary underline">
                    Selecionar imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void enviarImagem(p.id, f);
                      }}
                    />
                  </label>
                  <button
                    className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                    onClick={() => salvar(() => supabase.from("produtos").delete().eq("id", p.id))}
                  >
                    excluir produto
                  </button>
                </div>
              </div>

              {aberto && (
                <div className="space-y-2 p-2">
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full min-w-[1100px] border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="border border-border bg-grid-head px-2 py-1" colSpan={2} />
                          <th
                            className="border border-border bg-mp-head px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-mp-head-foreground"
                            colSpan={4}
                          >
                            Matéria-prima
                          </th>
                          <th
                            className="border border-border bg-proc-head px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-proc-head-foreground"
                            colSpan={4}
                          >
                            Processo
                          </th>
                          <th
                            className="border border-border bg-emb-head px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-emb-head-foreground"
                            colSpan={4}
                          >
                            Embalagem
                          </th>
                          <th className="border border-border bg-grid-head px-2 py-1" />
                        </tr>
                        <tr className="text-[11px] font-bold uppercase">
                          <th className="border border-border bg-grid-head px-2 py-1 text-left text-grid-head-foreground">
                            Tipo
                          </th>
                          <th className="border border-border bg-grid-head px-2 py-1 text-left text-grid-head-foreground">
                            Item
                          </th>
                          {["MP", "Peso (g)", "Valor/kg", "Custo MP"].map((h) => (
                            <th
                              key={h}
                              className="border border-border bg-mp-head px-2 py-1 text-left text-mp-head-foreground"
                            >
                              {h}
                            </th>
                          ))}
                          {["Cavidades", "Ciclo (s)", "Peças/h", "Injetora"].map((h) => (
                            <th
                              key={h}
                              className="border border-border bg-proc-head px-2 py-1 text-left text-proc-head-foreground"
                            >
                              {h}
                            </th>
                          ))}
                          {["Pçs/cx", "Pçs/pallet", "Caixas p/pallet", "Tipo de caixa"].map((h) => (
                            <th
                              key={h}
                              className="border border-border bg-emb-head px-2 py-1 text-left text-emb-head-foreground"
                            >
                              {h}
                            </th>
                          ))}
                          <th className="w-8 border border-border bg-grid-head px-1 py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {comps.map((c, i) => {
                          const { valor, auto } = resolveValorKg(c, dados.mpItens);
                          const kg = consumoKg(c.peso_g, 1);
                          const custo = kg !== null && valor !== null ? kg * valor : null;
                          return (
                            <tr key={c.id}>
                              {i === 0 && (
                                <td
                                  rowSpan={comps.length || 1}
                                  className="border border-border bg-mp-cell px-1 text-center align-middle"
                                >
                                  <CellInput
                                    value={p.tipo}
                                    onCommit={(v) => atualizarProduto(p.id, "tipo", v)}
                                    className="text-center text-xs font-semibold"
                                  />
                                </td>
                              )}
                              <td className="border border-border px-1 py-0.5">
                                <CellInput
                                  value={c.descricao}
                                  onCommit={(v) => atualizarComp(c.id, "descricao", v)}
                                  className="text-xs"
                                />
                              </td>
                              <td className="border border-border bg-mp-cell px-1 py-0.5">
                                <select
                                  value={c.mp ?? ""}
                                  onChange={(e) => atualizarComp(c.id, "mp", e.target.value)}
                                  className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                                >
                                  <option value="">—</option>
                                  {dados.mpItens.map((m) => (
                                    <option key={m.id} value={m.descricao}>
                                      {m.descricao}
                                    </option>
                                  ))}
                                  {c.mp && !dados.mpItens.some((m) => m.descricao === c.mp) && (
                                    <option value={c.mp}>{c.mp}</option>
                                  )}
                                </select>
                              </td>
                              <td className="border border-border bg-mp-cell px-1 py-0.5">
                                <CellInput
                                  type="number"
                                  value={c.peso_g}
                                  onCommit={(v) => atualizarComp(c.id, "peso_g", num(v))}
                                  className="text-xs"
                                />
                              </td>
                              <td className="border border-border bg-mp-cell px-1 py-0.5 text-xs font-semibold">
                                {auto ? (
                                  <span className="flex items-center gap-1" title="Valor da aba MP">
                                    {fmt(valor)}
                                    <span className="rounded bg-primary/15 px-1 text-[9px] font-bold text-primary">
                                      MP
                                    </span>
                                  </span>
                                ) : (
                                  <CellInput
                                    type="number"
                                    value={c.valor_kg}
                                    onCommit={(v) => atualizarComp(c.id, "valor_kg", num(v))}
                                    className="text-xs"
                                  />
                                )}
                              </td>
                              <td className="border border-border bg-mp-cell px-2 py-0.5 text-right text-xs font-bold">
                                {custo === null ? "-" : fmt(custo, 3)}
                              </td>
                              <td className="border border-border bg-proc-cell px-1 py-0.5">
                                <CellInput
                                  type="number"
                                  value={c.cavidades}
                                  onCommit={(v) => atualizarComp(c.id, "cavidades", num(v))}
                                  className="text-xs"
                                />
                              </td>
                              <td className="border border-border bg-proc-cell px-1 py-0.5">
                                <CellInput
                                  type="number"
                                  value={c.ciclo_s}
                                  onCommit={(v) => atualizarComp(c.id, "ciclo_s", num(v))}
                                  className="text-xs"
                                />
                              </td>
                              <td className="border border-border bg-proc-cell px-2 py-0.5 text-xs font-bold">
                                {fmt(pecasHora(c.cavidades, c.ciclo_s), 0)}
                              </td>
                              <td className="border border-border bg-proc-cell px-1 py-0.5">
                                <CellInput
                                  value={c.injetora}
                                  onCommit={(v) => atualizarComp(c.id, "injetora", v)}
                                  className="text-xs"
                                />
                              </td>

                              {i === meio && (
                                <>
                                  <td
                                    rowSpan={1}
                                    className="border border-border bg-emb-cell px-1 py-0.5"
                                  >
                                    <CellInput
                                      type="number"
                                      value={p.pcs_caixa}
                                      onCommit={(v) => atualizarProduto(p.id, "pcs_caixa", num(v))}
                                      className="text-xs"
                                    />
                                  </td>
                                  <td className="border border-border bg-emb-cell px-1 py-0.5">
                                    <CellInput
                                      type="number"
                                      value={p.pcs_pallet}
                                      onCommit={(v) => atualizarProduto(p.id, "pcs_pallet", num(v))}
                                      className="text-xs"
                                    />
                                  </td>
                                  <td className="border border-border bg-emb-cell px-1 py-0.5">
                                    <CellInput
                                      type="number"
                                      value={p.cxs_pallet}
                                      onCommit={(v) => atualizarProduto(p.id, "cxs_pallet", num(v))}
                                      className="text-xs"
                                    />
                                  </td>
                                  <td className="border border-border bg-emb-cell px-1 py-0.5">
                                    <CellInput
                                      value={p.caixa_tipo}
                                      onCommit={(v) => atualizarProduto(p.id, "caixa_tipo", v)}
                                      className="text-xs"
                                    />
                                  </td>
                                </>
                              )}
                              {i !== meio && (
                                <td className="border border-border bg-emb-cell" colSpan={4} />
                              )}

                              <td className="border border-border px-1 py-0.5 text-center">
                                <button
                                  aria-label="Excluir componente"
                                  className="text-muted-foreground transition-colors hover:text-destructive"
                                  onClick={() =>
                                    salvar(() =>
                                      supabase.from("componentes").delete().eq("id", c.id),
                                    )
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {comps.length === 0 && (
                          <tr>
                            <td colSpan={14} className="px-3 py-4 text-center text-muted-foreground">
                              Nenhum componente cadastrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      salvar(() =>
                        supabase.from("componentes").insert({
                          id: novoId("c"),
                          produto_id: p.id,
                          ordem: comps.length,
                          descricao: "",
                          mp: "",
                        }),
                      )
                    }
                  >
                    <Plus className="mr-1 size-3.5" /> novo item
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
