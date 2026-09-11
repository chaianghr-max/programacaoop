import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Mic, MicOff, PackageCheck, Search, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Dados } from "@/lib/vaeso/api";
import { fmtInt, num } from "@/lib/vaeso/calc";

type EntregaPks = {
  id: string;
  sku: string;
  quantidade: number;
  status: string;
};

type Baixa = {
  id: string;
  nf_numero: string;
  nf_data: string | null;
  sku: string;
  quantidade: number;
  created_at: string;
};

const PREFIXO = "EXPEDICAO ";

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

const horaBr = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const diaBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const diaLabel = (iso: string) => {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(data, hoje)) return `Hoje · ${diaBr(iso)}`;
  if (mesmoDia(data, ontem)) return `Ontem · ${diaBr(iso)}`;
  return diaBr(iso);
};

// Números por extenso mais comuns em fala curta ("vinte", "trinta e cinco"...),
// usados quando o reconhecimento de voz não converte automaticamente para dígitos.
const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40,
  cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100,
};

function palavrasParaNumero(texto: string): number | null {
  const partes = texto.split(/\s+e\s+|\s+/).filter(Boolean);
  let total = 0;
  let achou = false;
  for (const parte of partes) {
    if (parte in UNIDADES) {
      total += UNIDADES[parte];
      achou = true;
    }
  }
  return achou ? total : null;
}

/** Interpreta um comando falado como "SKU ABC123 quantidade vinte" ou "ABC123 20 unidades". */
function interpretarComando(transcript: string) {
  const bruto = transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let skuParte = bruto;
  let qtdeParte = "";

  const marcador = bruto.match(/\b(quantidade|qtde|qtd)\b/);
  if (marcador) {
    skuParte = bruto.slice(0, marcador.index).trim();
    qtdeParte = bruto.slice((marcador.index ?? 0) + marcador[0].length).trim();
  } else {
    const numeros = [...bruto.matchAll(/\d+/g)];
    if (numeros.length > 0) {
      const ultimo = numeros[numeros.length - 1];
      skuParte = bruto.slice(0, ultimo.index).trim();
      qtdeParte = bruto.slice(ultimo.index).trim();
    }
  }

  skuParte = skuParte.replace(/\b(sku|codigo|produto|item)\b/g, " ").trim();
  qtdeParte = qtdeParte.replace(/\b(unidades|unidade|pecas|peca|pcs)\b/g, " ").trim();

  const numeroDigitos = qtdeParte.match(/\d+/);
  const quantidade = numeroDigitos ? Number(numeroDigitos[0]) : palavrasParaNumero(qtdeParte);

  const skuBusca = normalizar(skuParte).replace(/\s+/g, "");

  return { skuBusca, quantidade: quantidade && quantidade > 0 ? quantidade : null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

function obterReconhecimentoDeVoz(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function falar(texto: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "pt-BR";
  fala.rate = 1.1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(fala);
}

export function ExpedicaoTab({ dados, podeEditar = true }: { dados: Dados; podeEditar?: boolean }) {
  const [busca, setBusca] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [ultimoComando, setUltimoComando] = useState<string | null>(null);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reconhecimentoRef = useRef<any>(null);
  const qc = useQueryClient();
  const suportaVoz = useMemo(() => obterReconhecimentoDeVoz() !== null, []);

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

  const saldoPorSku = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of aceitas) {
      const chave = normalizar(item.sku);
      mapa.set(chave, (mapa.get(chave) ?? 0) + Number(item.quantidade));
    }
    for (const item of baixas) {
      const chave = normalizar(item.sku);
      mapa.set(chave, (mapa.get(chave) ?? 0) - Number(item.quantidade));
    }
    return mapa;
  }, [aceitas, baixas]);

  const termo = busca.trim().toLowerCase();

  const itens = useMemo(
    () =>
      dados.skus
        .filter(
          (s) =>
            !termo ||
            s.sku.toLowerCase().includes(termo) ||
            s.descricao.toLowerCase().includes(termo) ||
            s.tipo.toLowerCase().includes(termo),
        )
        .map((s) => ({ ...s, saldo: saldoPorSku.get(normalizar(s.sku)) ?? 0 }))
        .sort((a, b) => a.sku.localeCompare(b.sku)),
    [dados.skus, saldoPorSku, termo],
  );

  /** Acha o melhor SKU correspondente ao trecho falado: match exato, começa-com ou contém. */
  function encontrarSkuPorVoz(skuBusca: string) {
    if (!skuBusca) return { encontrado: null, ambiguo: false };
    const candidatos = itens.filter((item) => {
      const codigo = normalizar(item.sku).replace(/\s+/g, "");
      return codigo === skuBusca || codigo.includes(skuBusca) || skuBusca.includes(codigo);
    });
    if (candidatos.length === 1) return { encontrado: candidatos[0], ambiguo: false };
    if (candidatos.length > 1) {
      const exato = candidatos.find((c) => normalizar(c.sku).replace(/\s+/g, "") === skuBusca);
      if (exato) return { encontrado: exato, ambiguo: false };
      return { encontrado: null, ambiguo: true };
    }
    return { encontrado: null, ambiguo: false };
  }

  async function processarComandoDeVoz(transcript: string) {
    setUltimoComando(transcript);
    const { skuBusca, quantidade } = interpretarComando(transcript);
    const { encontrado, ambiguo } = encontrarSkuPorVoz(skuBusca);

    if (ambiguo) {
      toast.error(`Mais de um SKU corresponde a "${skuBusca}". Diga o código completo.`);
      falar("Encontrei mais de um produto parecido. Diga o código completo.");
      return;
    }
    if (!encontrado) {
      toast.error(`Não encontrei nenhum SKU parecido com "${skuBusca || transcript}".`);
      falar("Não encontrei esse produto. Pode repetir?");
      return;
    }
    if (!quantidade) {
      toast.error(`Entendi o SKU ${encontrado.sku}, mas não entendi a quantidade. Diga de novo com a quantidade.`);
      falar(`Entendi o produto ${encontrado.sku}, mas não entendi a quantidade.`);
      return;
    }
    const ok = await registrarExpedicao(encontrado.sku, quantidade);
    if (ok) falar(`Expedido ${quantidade} de ${encontrado.sku}.`);
  }

  function alternarComandoDeVoz() {
    if (ouvindo) {
      reconhecimentoRef.current?.stop();
      return;
    }
    const Ctor = obterReconhecimentoDeVoz();
    if (!Ctor) {
      toast.error("Comando de voz não é suportado neste navegador. Use o Chrome no celular.");
      return;
    }
    const reconhecimento = new Ctor();
    reconhecimento.lang = "pt-BR";
    reconhecimento.interimResults = false;
    reconhecimento.maxAlternatives = 1;
    reconhecimento.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reconhecimento.onresult = (evento: any) => {
      const transcript = evento.results?.[0]?.[0]?.transcript as string | undefined;
      if (transcript) void processarComandoDeVoz(transcript);
    };
    reconhecimento.onerror = () => {
      toast.error("Não consegui ouvir. Verifique a permissão do microfone.");
    };
    reconhecimento.onend = () => setOuvindo(false);
    reconhecimentoRef.current = reconhecimento;
    setOuvindo(true);
    reconhecimento.start();
  }

  useEffect(() => {
    return () => reconhecimentoRef.current?.stop();
  }, []);

  const expedicoes = useMemo(() => baixas.filter((b) => b.nf_numero.startsWith(PREFIXO)), [baixas]);

  // Última expedição de cada SKU (para o "Desfazer" rápido em cada produto).
  const ultimaExpedicaoPorSku = useMemo(() => {
    const mapa = new Map<string, Baixa>();
    for (const exp of expedicoes) {
      const chave = normalizar(exp.sku);
      const atual = mapa.get(chave);
      if (!atual || exp.created_at > atual.created_at) mapa.set(chave, exp);
    }
    return mapa;
  }, [expedicoes]);

  // Expedições agrupadas por dia, mais recente primeiro.
  const expedicoesPorDia = useMemo(() => {
    const mapa = new Map<string, { label: string; itens: Baixa[]; qtde: number }>();
    for (const exp of expedicoes) {
      const chave = diaBr(exp.created_at);
      const atual = mapa.get(chave) ?? { label: diaLabel(exp.created_at), itens: [], qtde: 0 };
      atual.itens.push(exp);
      atual.qtde += Number(exp.quantidade);
      mapa.set(chave, atual);
    }
    return [...mapa.entries()]
      .map(([chave, valor]) => ({ chave, ...valor }))
      .sort((a, b) => (a.itens[0].created_at < b.itens[0].created_at ? 1 : -1));
  }, [expedicoes]);

  async function registrarExpedicao(sku: string, quantidadeVoz?: number) {
    const quantidade = quantidadeVoz ?? num(quantidades[sku]);
    if (!quantidade || quantidade <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setEnviando(sku);
    const agora = new Date();
    const { error } = await supabase.from("pks_estoque_baixas").insert({
      nf_numero: `${PREFIXO}${agora.toISOString()}`,
      nf_data: agora.toLocaleDateString("pt-BR"),
      sku,
      quantidade,
    });
    setEnviando(null);
    if (error) {
      toast.error(`Falha ao registrar expedição: ${error.message}`);
      return false;
    }
    setQuantidades((atual) => ({ ...atual, [sku]: "" }));
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success(`${fmtInt(quantidade)} un. de ${sku} expedidas para a Vaeso.`);
    return true;
  }

  async function estornarExpedicao(id: string, sku: string) {
    if (!window.confirm(`Cancelar esta expedição de ${sku}? A quantidade volta para o Estoque PKS.`)) return;
    const { error } = await supabase.from("pks_estoque_baixas").delete().eq("id", id);
    if (error) {
      toast.error(`Falha ao cancelar: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["pks-estoque-baixas"] });
    toast.success("Expedição cancelada.");
  }

  if (!podeEditar) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Seu acesso não permite lançar expedições.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="sticky top-0 z-10 -mx-3 space-y-2 bg-muted px-3 pb-2 pt-1 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <PackageCheck className="size-5 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-bold leading-tight">Expedição</div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              PKS → Vaeso · lança e já baixa do Estoque PKS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto por SKU ou descrição..."
              className="h-11 pl-9 text-base"
              inputMode="search"
            />
          </div>
          {suportaVoz && (
            <Button
              type="button"
              size="icon"
              className={`h-11 w-11 shrink-0 ${ouvindo ? "animate-pulse bg-destructive hover:bg-destructive" : ""}`}
              title={ouvindo ? "Parar comando de voz" : "Falar código e quantidade"}
              onClick={alternarComandoDeVoz}
            >
              {ouvindo ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </Button>
          )}
        </div>
        {ouvindo && (
          <div className="rounded-md bg-primary/10 px-3 py-1.5 text-center text-xs font-medium text-primary">
            Ouvindo... diga o código e a quantidade, ex: "1234 vinte unidades"
          </div>
        )}
        {!ouvindo && ultimoComando && (
          <div className="truncate rounded-md bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
            Último comando: "{ultimoComando}"
          </div>
        )}
      </div>

      <div className="space-y-2">
        {itens.map((item) => {
          const ultima = ultimaExpedicaoPorSku.get(normalizar(item.sku));
          return (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-card p-3 shadow-sm active:scale-[0.99] transition-transform"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{item.sku}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.descricao || "—"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Saldo PKS</div>
                  <div className={`text-sm font-bold ${item.saldo < 0 ? "text-destructive" : ""}`}>
                    {fmtInt(item.saldo)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Quantidade expedida"
                  value={quantidades[item.sku] ?? ""}
                  onChange={(e) => setQuantidades((atual) => ({ ...atual, [item.sku]: e.target.value }))}
                  className="h-11 flex-1 text-right text-base"
                />
                <Button
                  className="h-11 px-4"
                  disabled={enviando === item.sku || !quantidades[item.sku]}
                  onClick={() => void registrarExpedicao(item.sku)}
                >
                  {enviando === item.sku ? "..." : "Expedir"}
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
              {ultima && (
                <button
                  type="button"
                  onClick={() => void estornarExpedicao(ultima.id, ultima.sku)}
                  className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                >
                  <Undo2 className="size-3" />
                  Desfazer última expedição ({fmtInt(Number(ultima.quantidade))} · {horaBr(ultima.created_at)})
                </button>
              )}
            </div>
          );
        })}
        {itens.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado.
          </div>
        )}
      </div>

      {expedicoesPorDia.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
            <span className="size-2 rounded-[2px] bg-primary" />
            Movimentações por dia
          </div>
          <div className="space-y-2">
            {expedicoesPorDia.map((dia) => {
              const aberto = diaAberto === dia.chave;
              return (
                <div key={dia.chave} className="overflow-hidden rounded-lg border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setDiaAberto(aberto ? null : dia.chave)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{dia.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {dia.itens.length} lançamento(s) · {fmtInt(dia.qtde)} un.
                      </div>
                    </div>
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
                  </button>
                  {aberto && (
                    <div className="divide-y divide-border border-t border-border">
                      {dia.itens.map((exp) => (
                        <div key={exp.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{exp.sku}</div>
                            <div className="text-[11px] text-muted-foreground">{horaBr(exp.created_at)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{fmtInt(Number(exp.quantidade))}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              title="Cancelar expedição"
                              onClick={() => void estornarExpedicao(exp.id, exp.sku)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
