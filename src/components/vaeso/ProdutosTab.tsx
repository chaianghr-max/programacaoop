import { ChevronDown, ChevronRight, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CellInput } from "@/components/vaeso/CellInput";
import { supabase } from "@/integrations/supabase/client";
import { novoId, type Dados } from "@/lib/vaeso/api";
import { brl, consumoKg, fmt, num, pecasHora, resolveValorKg } from "@/lib/vaeso/calc";

export function ProdutosTab({
  dados,
  salvar,
}: {
  dados: Dados;
  salvar: (fn: () => Promise<unknown>) => void;
}) {
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const termo = busca.trim().toLowerCase();

  const produtos = dados.produtos.filter(
    (p) => !termo || p.nome.toLowerCase().includes(termo) || p.tipo.toLowerCase().includes(termo),
  );

  const atualizarProduto = (id: string, campo: string, valor: unknown) =>
    salvar(() => supabase.from("produtos").update({ [campo]: valor }).eq("id", id));

  const atualizarComp = (id: string, campo: string, valor: unknown) =>
    salvar(() => supabase.from("componentes").update({ [campo]: valor }).eq("id", id));

  async function enviarImagem(produtoId: string, file: File) {
    // Imagem redimensionada e guardada direto no banco (miniatura leve).
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 400;
          const escala = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou tipo do produto..."
          className="max-w-xs"
        />
        <Button
          onClick={() =>
            salvar(() =>
              supabase.from("produtos").insert({ id: novoId("p"), nome: "NOVO PRODUTO", tipo: "" }),
            )
          }
        >
          <Plus className="mr-1 size-4" /> novo produto
        </Button>
        <span className="text-sm text-muted-foreground">{produtos.length} produtos</span>
      </div>

      <div className="space-y-3">
        {produtos.map((p) => {
          const comps = dados.componentes.filter((c) => c.produto_id === p.id);
          const aberto = !!abertos[p.id];
          return (
            <div key={p.id} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 p-3">
                <button
                  onClick={() => setAbertos((s) => ({ ...s, [p.id]: !aberto }))}
                  className="text-muted-foreground"
                  aria-label={aberto ? "Recolher" : "Expandir"}
                >
                  {aberto ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
                </button>

                {p.imagem ? (
                  <img
                    src={p.imagem}
                    alt={p.nome}
                    className="size-12 rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
                    sem imagem
                  </div>
                )}

                <div className="min-w-[220px] flex-1">
                  <CellInput
                    value={p.nome}
                    onCommit={(v) => atualizarProduto(p.id, "nome", v)}
                    className="text-base font-semibold"
                  />
                  <div className="px-2 text-xs text-muted-foreground">
                    {comps.length} componentes · tipo{" "}
                    <span className="font-medium text-foreground">{p.tipo || "—"}</span>
                  </div>
                </div>

                <label className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
                  <ImagePlus className="size-4" />
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
                  aria-label="Excluir produto"
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => salvar(() => supabase.from("produtos").delete().eq("id", p.id))}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {aberto && (
                <div className="space-y-4 border-t border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo label="Tipo">
                      <CellInput value={p.tipo} onCommit={(v) => atualizarProduto(p.id, "tipo", v)} />
                    </Campo>
                  </div>

                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary text-secondary-foreground">
                          <th className="px-3 py-1 text-left" />
                          <th className="border-l border-border px-3 py-1 text-center font-semibold" colSpan={4}>
                            Matéria-prima
                          </th>
                          <th className="border-l border-border px-3 py-1 text-center font-semibold" colSpan={4}>
                            Processo
                          </th>
                          <th className="w-10 border-l border-border px-3 py-1" />
                        </tr>
                        <tr className="bg-muted text-xs text-muted-foreground">
                          <th className="px-3 py-1 text-left">Componente</th>
                          <th className="border-l border-border px-3 py-1 text-left">MP</th>
                          <th className="px-3 py-1 text-left">Peso (g)</th>
                          <th className="px-3 py-1 text-left">Valor/kg</th>
                          <th className="px-3 py-1 text-left">Custo MP</th>
                          <th className="border-l border-border px-3 py-1 text-left">Cavidades</th>
                          <th className="px-3 py-1 text-left">Ciclo (s)</th>
                          <th className="px-3 py-1 text-left">Peças/h</th>
                          <th className="px-3 py-1 text-left">Injetora</th>
                          <th className="border-l border-border px-3 py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {comps.map((c) => {
                          const { valor, auto } = resolveValorKg(c, dados.mpItens);
                          const kg = consumoKg(c.peso_g, 1);
                          const custo = kg !== null && valor !== null ? kg * valor : null;
                          return (
                            <tr key={c.id} className="border-t border-border">
                              <td className="px-1 py-1">
                                <CellInput
                                  value={c.descricao}
                                  onCommit={(v) => atualizarComp(c.id, "descricao", v)}
                                />
                              </td>
                              <td className="border-l border-border px-1 py-1">
                                <select
                                  value={c.mp ?? ""}
                                  onChange={(e) => atualizarComp(c.id, "mp", e.target.value)}
                                  className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border"
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
                              <td className="px-1 py-1">
                                <CellInput
                                  type="number"
                                  value={c.peso_g}
                                  onCommit={(v) => atualizarComp(c.id, "peso_g", num(v))}
                                />
                              </td>
                              <td className="px-1 py-1">
                                {auto ? (
                                  <span className="px-2 text-sm text-primary" title="Valor da aba MP">
                                    {brl(valor)}
                                  </span>
                                ) : (
                                  <CellInput
                                    type="number"
                                    value={c.valor_kg}
                                    onCommit={(v) => atualizarComp(c.id, "valor_kg", num(v))}
                                  />
                                )}
                              </td>
                              <td className="px-3 py-1 text-muted-foreground">
                                {custo === null ? "-" : `${brl(custo)} /pç`}
                              </td>
                              <td className="border-l border-border px-1 py-1">
                                <CellInput
                                  type="number"
                                  value={c.cavidades}
                                  onCommit={(v) => atualizarComp(c.id, "cavidades", num(v))}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <CellInput
                                  type="number"
                                  value={c.ciclo_s}
                                  onCommit={(v) => atualizarComp(c.id, "ciclo_s", num(v))}
                                />
                              </td>
                              <td className="px-3 py-1 text-muted-foreground">
                                {fmt(pecasHora(c.cavidades, c.ciclo_s), 0)}
                              </td>
                              <td className="px-1 py-1">
                                <CellInput
                                  value={c.injetora}
                                  onCommit={(v) => atualizarComp(c.id, "injetora", v)}
                                />
                              </td>
                              <td className="border-l border-border px-3 py-1">
                                <button
                                  aria-label="Excluir componente"
                                  className="text-muted-foreground transition-colors hover:text-destructive"
                                  onClick={() =>
                                    salvar(() => supabase.from("componentes").delete().eq("id", c.id))
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
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
                    <Plus className="mr-1 size-4" /> componente
                  </Button>

                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Embalagem
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Campo label="Pçs/caixa">
                        <CellInput
                          type="number"
                          value={p.pcs_caixa}
                          onCommit={(v) => atualizarProduto(p.id, "pcs_caixa", num(v))}
                        />
                      </Campo>
                      <Campo label="Pçs/pallet">
                        <CellInput
                          type="number"
                          value={p.pcs_pallet}
                          onCommit={(v) => atualizarProduto(p.id, "pcs_pallet", num(v))}
                        />
                      </Campo>
                      <Campo label="Caixas por pallet">
                        <CellInput
                          type="number"
                          value={p.cxs_pallet}
                          onCommit={(v) => atualizarProduto(p.id, "cxs_pallet", num(v))}
                        />
                      </Campo>
                      <Campo label="Tipo de caixa">
                        <CellInput
                          value={p.caixa_tipo}
                          onCommit={(v) => atualizarProduto(p.id, "caixa_tipo", v)}
                        />
                      </Campo>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="px-2 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
