import type { Componente, MpItem, Produto, Sku } from "./types";

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const fmt = (v: number | null | undefined, casas = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "-"
    : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const fmtInt = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : Math.round(v).toLocaleString("pt-BR");

export const brl = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : `R$ ${fmt(v)}`;

/** Valor por kg resolvido: MP cadastrada com valor sobrescreve o valor manual do componente. */
export function resolveValorKg(comp: Componente, mpItens: MpItem[]): { valor: number | null; auto: boolean } {
  const mp = mpItens.find(
    (m) => m.descricao.trim().toUpperCase() === (comp.mp ?? "").trim().toUpperCase(),
  );
  if (mp && num(mp.valor_kg) !== null) return { valor: num(mp.valor_kg), auto: true };
  return { valor: num(comp.valor_kg), auto: false };
}

/** Peças por hora = cavidades x 3600 / ciclo_s */
export function pecasHora(cavidades: number | null, cicloS: number | null): number | null {
  const c = num(cavidades);
  const t = num(cicloS);
  if (!c || !t) return null;
  return (c * 3600) / t;
}

export function consumoKg(pesoG: number | null, quantidade: number): number | null {
  const p = num(pesoG);
  if (p === null) return null;
  return (p * quantidade) / 1000;
}

export function horasMaquina(quantidade: number, ph: number | null): number | null {
  if (!ph) return null;
  return quantidade / ph;
}

export function qtdeSugerida(quantidade: number, pcsCaixa: number | null): number {
  const p = num(pcsCaixa);
  if (!p) return quantidade;
  return Math.ceil(quantidade / p) * p;
}

export function percentPallet(sugerida: number, pcsPallet: number | null): number | null {
  const p = num(pcsPallet);
  if (!p) return null;
  return (sugerida / p) * 100;
}

export function produtoDoSku(sku: Sku, produtos: Produto[]): Produto | null {
  return (
    produtos.find((p) => (p.skus ?? []).includes(sku.sku)) ??
    produtos.find((p) => p.tipo && p.tipo === sku.tipo) ??
    null
  );
}

export type LinhaComponente = {
  comp: Componente;
  ph: number | null;
  horas: number | null;
  kg: number | null;
  valorKg: number | null;
  custo: number | null;
};

export type LinhaSku = {
  sku: Sku;
  produto: Produto | null;
  quantidade: number;
  sugerida: number;
  pallet: number | null;
  horas: number | null;
  custo: number | null;
  kgPorMp: Record<string, number>;
  componentes: LinhaComponente[];
};

export function calcularLinhaSku(
  sku: Sku,
  produtos: Produto[],
  componentes: Componente[],
  mpItens: MpItem[],
  quantidade: number,
): LinhaSku {
  const compDireto = sku.componente_id
    ? (componentes.find((c) => c.id === sku.componente_id) ?? null)
    : null;
  const produto = compDireto
    ? (produtos.find((p) => p.id === compDireto.produto_id) ?? null)
    : produtoDoSku(sku, produtos);
  const comps = compDireto
    ? [compDireto]
    : produto
      ? componentes.filter((c) => c.produto_id === produto.id)
      : [];
  const kgPorMp: Record<string, number> = {};
  let horas: number | null = null;
  let custo: number | null = null;

  const linhas = comps.map((comp) => {
    const ph = pecasHora(comp.cavidades, comp.ciclo_s);
    const h = horasMaquina(quantidade, ph);
    const kg = consumoKg(comp.peso_g, quantidade);
    const { valor } = resolveValorKg(comp, mpItens);
    const c = kg !== null && valor !== null ? kg * valor : null;
    if (h !== null) horas = (horas ?? 0) + h;
    if (c !== null) custo = (custo ?? 0) + c;
    if (kg !== null) {
      const key = (comp.mp ?? "").trim().toUpperCase();
      kgPorMp[key] = (kgPorMp[key] ?? 0) + kg;
    }
    return { comp, ph, horas: h, kg, valorKg: valor, custo: c };
  });

  const sugerida = qtdeSugerida(quantidade, produto?.pcs_caixa ?? null);

  return {
    sku,
    produto,
    quantidade,
    sugerida,
    pallet: produto ? percentPallet(sugerida, produto.pcs_pallet) : null,
    horas,
    custo,
    kgPorMp,
    componentes: linhas,
  };
}

export type LinhaEstrutura = {
  key: string;
  item: string;
  mp: string;
  produtoNome: string;
  tipo: string;
  skus: string[];
  quantidade: number;
  pesoG: number | null;
  kg: number | null;
  cavidades: number | null;
  cicloS: number | null;
  ph: number | null;
  horas: number | null;
};

export function montarEstrutura(linhas: LinhaSku[], _componentes?: Componente[]): LinhaEstrutura[] {
  const porComponente = new Map<
    string,
    { comp: Componente; qtd: number; skus: string[]; nome: string; tipo: string }
  >();
  for (const l of linhas) {
    for (const lc of l.componentes) {
      const atual = porComponente.get(lc.comp.id) ?? {
        comp: lc.comp,
        qtd: 0,
        skus: [],
        nome: l.produto?.nome ?? "",
        tipo: l.produto?.tipo ?? l.sku.tipo,
      };
      atual.qtd += l.quantidade;
      if (!atual.skus.includes(l.sku.sku)) atual.skus.push(l.sku.sku);
      porComponente.set(lc.comp.id, atual);
    }
  }
  const out: LinhaEstrutura[] = [];
  for (const info of porComponente.values()) {
    const comp = info.comp;
    const ph = pecasHora(comp.cavidades, comp.ciclo_s);
    out.push({
      key: comp.id,
      item: comp.descricao,
      mp: comp.mp,
      produtoNome: info.nome,
      tipo: info.tipo,
      skus: info.skus,
      quantidade: info.qtd,
      pesoG: comp.peso_g,
      kg: consumoKg(comp.peso_g, info.qtd),
      cavidades: comp.cavidades,
      cicloS: comp.ciclo_s,
      ph,
      horas: horasMaquina(info.qtd, ph),
    });
  }
  return out;
}
