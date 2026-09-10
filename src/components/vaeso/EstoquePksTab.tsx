import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, Plus, Sheet, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Dados } from "@/lib/vaeso/api";
import { fmt, fmtInt, num, produtoDoSku } from "@/lib/vaeso/calc";
import { parseNfLinhas } from "@/lib/vaeso/nf";
import { extrairTextoPdf } from "@/lib/vaeso/pdf";

type EntregaPks = {
  id: string;
  ordem_id: string;
  sku: string;
  quantidade: number;
  status: string;
  accepted_at: string | null;
  created_at: string;
};

type Baixa = {
  id: string;
  nf_numero: string;
  nf_data: string | null;
  sku: string;
  quantidade: number;
  created_at: string;
};

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

const dataBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export function EstoquePksTab({ dados, podeEditar = true }: { dados: Dados; podeEditar?: boolean }) {
  const [busca, setBusca] = useState("");
  const [importando, setImportando] = useState(false);
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [novoSku, setNovoSku] = useState("");
  const [novaQtde, setNovaQtde] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // Apontamentos da PKS: entram no estoque mesmo antes do aceite na Programação.
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

  const numeroOrdem = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const pedido of dados.pedidos) {
      mapa.set(`p${pedido.slot}`, pedido.numero ?? String(pedido.slot));
    }
    return mapa;
  }, [dados.pedidos]);

  const infoSku = (codigo: string) => {
    const sku = dados.skus.find((item) => normalizar(item.sku) === normalizar(codigo));
    const produto = sku ? produtoDoSku(sku, dados.produtos) : null;
    return {
      descricao: sku?.descricao ?? "—",
      tipo: sku?.tipo ?? "—",
      pcsPallet: produto?.pcs_pallet ?? null,
    };
  };

  const termo = busca.trim().toLowerCase();

  const saldos = useMemo(() => {
    type Item = {
      sku: string;
      produzido: number;
      baixado: number;
      ocs: Set<string>;
      ultima: string | null;
    };
    const mapa = new Map<string, Item>();
    const obter = (codigo: string) => {
      const chave = normalizar(codigo);
      const atual =
        mapa.get(chave) ??
        { sku: codigo, produzido: 0, baixado: 0, ocs: new Set<string>(), ultima: null };
      mapa.set(chave, atual);
      return atual;
    };
    for (const item of aceitas) {
      const atual = obter(item.sku);
      atual.produzido += Number(item.quantidade);
      atual.ocs.add(numeroOrdem.get(item.ordem_id) ?? item.ordem_id);
      const data = item.accepted_at ?? item.created_at;
      if (!atual.ultima || data > atual.ultima) atual.ultima = data;
    }

    for (const item of baixas) {
      obter(item.sku).baixado += Number(item.quantidade);
    }
    return [...mapa.values()]
      .map((item) => {
        const info = infoSku(item.sku);
        const saldo = item.produzido - item.baixado;
        return {
          ...item,
          ocs: [...item.ocs].join(", "),
          descricao: info.descricao,
          tipo: info.tipo,
          saldo,
          pallets: info.pcsPallet ? saldo / info.pcsPallet : null,
        };
      })
      .filter(
        (item) =>
          !termo ||
          item.sku.toLowerCase().includes(termo) ||
          item.descricao.toLowerCase().includes(termo) ||
          item.tipo.toLowerCase().includes(termo) ||
          item.ocs.toLowerCase().includes(termo),
      )
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [aceitas, baixas, numeroOrdem, dados.skus, dados.produtos, termo]);

  const totais = useMemo(
    () =>
      saldos.reduce(
        (acumulado, item) => ({
          produzido: acumulado.produzido + item.produzido,
          baixado: acumulado.baixado + item.baixado,
          saldo: acumulado.saldo + item.saldo,
          pallets: acumulado.pallets + (item.pallets ?? 0),
        }),
        { produzido: 0, baixado: 0, saldo: 0, pallets: 0 },
      ),
    [saldos],
  );

  /** Grava a diferença como um ajuste manual de estoque. */
  async function ajustarSaldo(sku: string, saldoAtual: number) {
    const novo = num(ajustes[sku]);
    if (novo === null || novo === saldoAtual) return;
    const agora = new Date();
    const { error } = await supabase.from("pks_estoque_baixas").insert({
      nf_numero: `AJUSTE ${agora.toISOString()}`,
      nf_data: agora.toLocaleDateString("pt-BR"),
      sku,
      quantidade: saldoAtual - novo,
    });
    if (error) {
      toast.error(`Falha ao ajustar o saldo: ${error.message}`);
      return;
    }
    setAjustes((atual) => ({ ...atual, [sku]: "" }));
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success(`Saldo de ${sku} ajustado para ${fmtInt(novo)}.`);
  }

  /** Inclui um item no estoque sem vínculo com ordem de compra. */
  async function incluirItemManual() {
    const sku = novoSku.trim().toUpperCase();
    const quantidade = num(novaQtde);
    if (!sku || !quantidade) {
      toast.error("Informe o SKU e a quantidade.");
      return;
    }
    const agora = new Date();
    const { error } = await supabase.from("pks_estoque_baixas").insert({
      nf_numero: `AJUSTE ${agora.toISOString()}`,
      nf_data: agora.toLocaleDateString("pt-BR"),
      sku,
      quantidade: -quantidade,
    });
    if (error) {
      toast.error(`Falha ao incluir o item: ${error.message}`);
      return;
    }
    setNovoSku("");
    setNovaQtde("");
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success(`${fmtInt(quantidade)} unidades de ${sku} incluídas no estoque.`);
  }

  /** Remove a linha do estoque: cancela os apontamentos e apaga as baixas do SKU. */
  async function excluirLinha(sku: string) {
    if (!window.confirm(`Excluir a linha ${sku} do estoque? Os apontamentos e as baixas deste SKU serão removidos.`)) {
      return;
    }
    const alvos = aceitas.filter((item) => normalizar(item.sku) === normalizar(sku));
    for (const item of alvos) {
      const { error } = await supabase.rpc("pks_estornar_entrega", { _entrega_id: item.id });
      if (error) {
        toast.error(`Falha ao excluir a linha: ${error.message}`);
        return;
      }
    }
    const alvoBaixas = baixas
      .filter((item) => normalizar(item.sku) === normalizar(sku))
      .map((item) => item.id);
    if (alvoBaixas.length > 0) {
      const { error } = await supabase.from("pks_estoque_baixas").delete().in("id", alvoBaixas);
      if (error) {
        toast.error(`Falha ao excluir a linha: ${error.message}`);
        return;
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] }),
      qc.invalidateQueries({ queryKey: ["pks-entregas", "estoque"] }),
      qc.invalidateQueries({ queryKey: ["pks-entregas"] }),
    ]);
    toast.success(`Linha ${sku} removida do estoque.`);
  }

  function exportarExcel() {
    const cabecalho = [
      "OC",
      "Tipo",
      "SKU",
      "Descrição",
      "Última produção",
      "Produzido",
      "Baixado (NF)",
      "Saldo",
      "Pallets",
    ];
    const linhas = saldos.map((item) => [
      item.ocs,
      item.tipo,
      item.sku,
      item.descricao,
      dataBr(item.ultima),
      item.produzido,
      item.baixado,
      item.saldo,
      item.pallets === null ? "" : item.pallets.toFixed(2).replace(".", ","),
    ]);
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `estoque-pks-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }


  async function importarNf(file: File) {
    setImportando(true);
    try {
      const linhas = await extrairTextoPdf(file);
      const nf = parseNfLinhas(linhas);
      if (!nf.numero) {
        toast.error("Não foi possível identificar o número da NF no PDF.");
        return;
      }
      if (nf.itens.length === 0) {
        toast.error("Nenhum item reconhecido na NF.");
        return;
      }
      const registros = nf.itens.map((item) => ({
        nf_numero: nf.numero as string,
        nf_data: nf.data,
        sku: item.sku,
        quantidade: item.quantidade,
      }));
      const { error } = await supabase.from("pks_estoque_baixas").insert(registros);
      if (error) {
        if (error.code === "23505") {
          toast.error(`A NF ${nf.numero} já foi importada.`);
          return;
        }
        toast.error(`Falha ao baixar estoque: ${error.message}`);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
      toast.success(`NF ${nf.numero} importada · ${registros.length} itens baixados.`);
    } catch (erro) {
      toast.error(`Erro ao ler o PDF: ${(erro as Error).message}`);
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removerNf(numero: string) {
    const { error } = await supabase.from("pks_estoque_baixas").delete().eq("nf_numero", numero);
    if (error) {
      toast.error(`Falha ao remover a NF: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success(`Baixas da NF ${numero} removidas.`);
  }

  const notas = useMemo(() => {
    const mapa = new Map<string, { numero: string; data: string | null; itens: number; qtde: number }>();
    for (const item of baixas) {
      const atual = mapa.get(item.nf_numero) ?? {
        numero: item.nf_numero,
        data: item.nf_data,
        itens: 0,
        qtde: 0,
      };
      atual.itens += 1;
      atual.qtde += Number(item.quantidade);
      mapa.set(item.nf_numero, atual);
    }
    return [...mapa.values()];
  }, [baixas]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SecaoTitulo>Estoque PKS</SecaoTitulo>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por SKU, descrição ou OC..."
            className="h-8 max-w-xs"
          />
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(evento) => {
              const file = evento.target.files?.[0];
              if (file) void importarNf(file);
            }}
          />
          <Button size="sm" variant="outline" disabled={saldos.length === 0} onClick={exportarExcel}>
            <Sheet className="mr-1 size-4" /> Salvar em Excel
          </Button>
          <Button size="sm" disabled={importando || !podeEditar} onClick={() => inputRef.current?.click()}>
            <FileUp className="mr-1 size-4" />
            {importando ? "Lendo NF..." : "Importar NF (PDF)"}
          </Button>
        </div>
      </div>

      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            Incluir item avulso (sem ordem)
          </div>
          <Input
            value={novoSku}
            onChange={(evento) => setNovoSku(evento.target.value)}
            placeholder="SKU"
            className="h-8 w-40"
          />
          <Input
            type="number"
            value={novaQtde}
            onChange={(evento) => setNovaQtde(evento.target.value)}
            placeholder="Quantidade"
            className="h-8 w-32 text-right"
          />
          <Button size="sm" onClick={() => void incluirItemManual()}>
            <Plus className="mr-1 size-4" /> Incluir no estoque
          </Button>
        </div>
      )}



      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[1080px] text-xs">
          <thead className="sticky top-0 z-10 bg-grid-head text-grid-head-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left uppercase">OC</th>
              <th className="px-2 py-1.5 text-left uppercase">Tipo</th>
              <th className="px-2 py-1.5 text-left uppercase">SKU</th>
              <th className="px-2 py-1.5 text-left uppercase">Descrição</th>
              <th className="px-2 py-1.5 text-left uppercase">Última produção</th>
              <th className="px-2 py-1.5 text-right uppercase">Produzido</th>
              <th className="px-2 py-1.5 text-right uppercase">Baixado (NF)</th>
              <th className="px-2 py-1.5 text-right uppercase">Saldo</th>
              {podeEditar && <th className="px-2 py-1.5 text-center uppercase">Ajustar saldo</th>}
              <th className="px-2 py-1.5 text-right uppercase">Pallets</th>
              {podeEditar && <th className="w-10 px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {saldos.map((item) => (
              <tr key={item.sku} className="border-t border-border even:bg-mp-cell">
                <td className="px-2 py-1 font-semibold">{item.ocs || "—"}</td>
                <td className="px-2 py-1">{item.tipo}</td>
                <td className="px-2 py-1 font-semibold">{item.sku}</td>
                <td className="px-2 py-1">{item.descricao}</td>
                <td className="px-2 py-1">{dataBr(item.ultima)}</td>
                <td className="px-2 py-1 text-right">{fmtInt(item.produzido)}</td>
                <td className="px-2 py-1 text-right">{fmtInt(item.baixado)}</td>
                <td className="px-2 py-1 text-right font-bold">{fmtInt(item.saldo)}</td>
                {podeEditar && (
                  <td className="px-2 py-1">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        value={ajustes[item.sku] ?? ""}
                        placeholder={fmtInt(item.saldo)}
                        onChange={(evento) =>
                          setAjustes((atual) => ({ ...atual, [item.sku]: evento.target.value }))
                        }
                        className="h-7 w-24 text-right"
                      />
                      <Button
                        size="icon"
                        className="size-7"
                        title="Gravar novo saldo"
                        disabled={!ajustes[item.sku]}
                        onClick={() => void ajustarSaldo(item.sku, item.saldo)}
                      >
                        <Check className="size-4" />
                      </Button>
                    </div>
                  </td>
                )}
                <td className="px-2 py-1 text-right">{item.pallets === null ? "—" : fmt(item.pallets, 2)}</td>
                {podeEditar && (
                  <td className="px-2 py-1 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Excluir esta linha do estoque"
                      onClick={() => void excluirLinha(item.sku)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {saldos.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 11 : 9} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum apontamento da PKS até o momento.
                </td>
              </tr>
            )}
          </tbody>

          {saldos.length > 0 && (
            <tfoot className="sticky bottom-0 bg-secondary font-bold">
              <tr className="border-t-2 border-border">
                <td className="px-2 py-1.5 uppercase" colSpan={5}>
                  Total ({saldos.length} SKUs)
                </td>
                <td className="px-2 py-1.5 text-right">{fmtInt(totais.produzido)}</td>
                <td className="px-2 py-1.5 text-right">{fmtInt(totais.baixado)}</td>
                <td className="px-2 py-1.5 text-right">{fmtInt(totais.saldo)}</td>
                {podeEditar && <td />}
                <td className="px-2 py-1.5 text-right">{fmt(totais.pallets, 2)}</td>
                {podeEditar && <td />}


              </tr>
            </tfoot>
          )}
        </table>
      </div>


      <SecaoTitulo>Notas fiscais importadas</SecaoTitulo>
      <div className="overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="bg-grid-head text-grid-head-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left uppercase">NF</th>
              <th className="px-2 py-1.5 text-left uppercase">Emissão</th>
              <th className="px-2 py-1.5 text-right uppercase">Itens</th>
              <th className="px-2 py-1.5 text-right uppercase">Quantidade</th>
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {notas.map((nota) => (
              <tr key={nota.numero} className="border-t border-border even:bg-mp-cell">
                <td className="px-2 py-1 font-semibold">{nota.numero}</td>
                <td className="px-2 py-1">{nota.data ?? "—"}</td>
                <td className="px-2 py-1 text-right">{nota.itens}</td>
                <td className="px-2 py-1 text-right font-bold">{fmtInt(nota.qtde)}</td>
                <td className="px-2 py-1 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="Remover baixas desta NF"
                    onClick={() => void removerNf(nota.numero)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {notas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma NF importada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
