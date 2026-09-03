import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { CellInput } from "@/components/vaeso/CellInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { novoId, type Dados, type Salvar } from "@/lib/vaeso/api";

export function SkusTab({
  dados,
  salvar,
}: {
  dados: Dados;
  salvar: Salvar;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const itens = dados.skus.filter(
    (s) =>
      !termo ||
      s.sku.toLowerCase().includes(termo) ||
      s.tipo.toLowerCase().includes(termo) ||
      s.descricao.toLowerCase().includes(termo),
  );

  const atualizar = (id: string, campo: string, valor: string | null) =>
    salvar(() => supabase.from("skus").update({ [campo]: valor } as never).eq("id", id));

  const opcoesComponentes = dados.produtos
    .map((p) => ({
      produto: p,
      comps: dados.componentes.filter((c) => c.produto_id === p.id),
    }))
    .filter((g) => g.comps.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por descrição, tipo ou SKU..."
          className="max-w-xs"
        />
        <Button
          onClick={() =>
            salvar(() =>
              supabase.from("skus").insert({ id: novoId("sk"), tipo: "", sku: "", descricao: "" }),
            )
          }
        >
          <Plus className="mr-1 size-4" /> novo SKU
        </Button>
        <span className="text-sm text-muted-foreground">{itens.length} SKUs</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              <th className="w-28 px-3 py-2 text-left font-semibold">Tipo</th>
              <th className="w-40 px-3 py-2 text-left font-semibold">SKU</th>
              <th className="px-3 py-2 text-left font-semibold">Descrição</th>
              <th className="w-64 px-3 py-2 text-left font-semibold">Item da estrutura</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {itens.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-1 py-1">
                  <CellInput value={s.tipo} onCommit={(v) => atualizar(s.id, "tipo", v)} />
                </td>
                <td className="px-1 py-1">
                  <CellInput value={s.sku} onCommit={(v) => atualizar(s.id, "sku", v)} />
                </td>
                <td className="px-1 py-1">
                  <CellInput value={s.descricao} onCommit={(v) => atualizar(s.id, "descricao", v)} />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={s.componente_id ?? ""}
                    onChange={(e) => atualizar(s.id, "componente_id", e.target.value || null)}
                  >
                    <option value="">Produto completo</option>
                    {opcoesComponentes.map((g) => (
                      <optgroup key={g.produto.id} label={g.produto.nome}>
                        {g.comps.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.descricao}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1">
                  <button
                    aria-label="Excluir"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => salvar(() => supabase.from("skus").delete().eq("id", s.id))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum SKU encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
