import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { CellInput } from "@/components/vaeso/CellInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { novoId, type Dados } from "@/lib/vaeso/api";
import { num } from "@/lib/vaeso/calc";

export function MpTab({ dados, salvar }: { dados: Dados; salvar: (fn: () => Promise<unknown>) => void }) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const itens = dados.mpItens.filter(
    (m) =>
      !termo ||
      m.descricao.toLowerCase().includes(termo) ||
      (m.fornecedor ?? "").toLowerCase().includes(termo),
  );

  const atualizar = (id: string, campo: string, valor: unknown) =>
    salvar(() => supabase.from("mp_itens").update({ [campo]: valor }).eq("id", id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por descrição ou fornecedor..."
          className="max-w-xs"
        />
        <Button
          onClick={() =>
            salvar(() =>
              supabase.from("mp_itens").insert({ id: novoId("mp"), descricao: "", fornecedor: "" }),
            )
          }
        >
          <Plus className="mr-1 size-4" /> novo item
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              <th className="w-16 px-3 py-2 text-left font-semibold">Item</th>
              <th className="px-3 py-2 text-left font-semibold">Descrição</th>
              <th className="px-3 py-2 text-left font-semibold">Fornecedor</th>
              <th className="px-3 py-2 text-left font-semibold">Valor MP (R$/kg)</th>
              <th className="px-3 py-2 text-left font-semibold">% ICMS</th>
              <th className="px-3 py-2 text-left font-semibold">% IPI</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {itens.map((m, i) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-3 py-1 text-muted-foreground">{i + 1}</td>
                <td className="px-1 py-1">
                  <CellInput value={m.descricao} onCommit={(v) => atualizar(m.id, "descricao", v)} />
                </td>
                <td className="px-1 py-1">
                  <CellInput value={m.fornecedor} onCommit={(v) => atualizar(m.id, "fornecedor", v)} />
                </td>
                <td className="px-1 py-1">
                  <CellInput
                    type="number"
                    value={m.valor_kg}
                    onCommit={(v) => atualizar(m.id, "valor_kg", num(v))}
                  />
                </td>
                <td className="px-1 py-1">
                  <CellInput type="number" value={m.icms} onCommit={(v) => atualizar(m.id, "icms", num(v))} />
                </td>
                <td className="px-1 py-1">
                  <CellInput type="number" value={m.ipi} onCommit={(v) => atualizar(m.id, "ipi", num(v))} />
                </td>
                <td className="px-3 py-1">
                  <button
                    aria-label="Excluir"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => salvar(() => supabase.from("mp_itens").delete().eq("id", m.id))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma matéria-prima encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
