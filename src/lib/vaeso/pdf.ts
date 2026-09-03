import type { PedidoItem, Produto, Sku } from "./types";

const IGNORAR = [
  "Item GTIN",
  "Total",
  "Observa",
  "Fornecedor",
  "Número do pedido",
  "Numero do pedido",
  "Data prevista",
  "Data ",
];

const ITEM_RE =
  /^(.*?)\s*(?:(\d{6,14})\s+)?((?:\d{1,3}\.)*\d+,\d{2})\s+(PC|PÇ)\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s*$/i;

const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export type PedidoParseado = {
  numero: string | null;
  data: string | null;
  fornecedor: string | null;
  itens: PedidoItem[];
};

export function parsePedidoLinhas(linhasBrutas: string[]): PedidoParseado {
  const linhas = linhasBrutas.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  let numero: string | null = null;
  let data: string | null = null;
  let fornecedor: string | null = null;
  const itens: PedidoItem[] = [];
  let acumulado: string[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";

    const mNum = linha.match(/Ordem de Compra\s*N[ºo°]?\s*(\d+)/i);
    if (mNum?.[1] && !numero) numero = mNum[1];

    const mData = linha.match(/^Data\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (mData?.[1] && !data) data = mData[1];

    if (
      !fornecedor &&
      /(LTDA|EIRELI|S\/A|S\.A\.|\bME\b)/i.test(linha) &&
      !/VAESO/i.test(linha) &&
      !/Ordem de Compra/i.test(linha)
    ) {
      fornecedor = linha
        .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "")
        .replace(/N[úu]mero do pedido.*/i, "")
        .replace(/CNPJ:?/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    if (/Itens da compra/i.test(linha) || /^Item\s/i.test(linha)) {
      acumulado = [];
      continue;
    }

    if (IGNORAR.some((p) => linha.startsWith(p))) continue;

    const m = linha.match(ITEM_RE);
    if (m) {
      const nome = [...acumulado, m[1] ?? ""].join(" ").replace(/\s{2,}/g, " ").trim();
      acumulado = [];
      const qtde = parseNum(m[3] ?? "0");
      let sku: string | null = null;
      const prox = linhas[i + 1] ?? "";
      const mSku = prox.match(/SKU:\s*([A-Za-z0-9._\-\/]+)/i);
      if (mSku?.[1]) sku = mSku[1];
      itens.push({ nome, sku, qtde, tipo: null, produto_id: null });
      continue;
    }

    if (/SKU:/i.test(linha)) continue;
    if (/^[\d.,\s]+$/.test(linha)) continue;
    if (linha.length > 3 && linha.length < 120 && !/Ordem de Compra/i.test(linha)) {
      acumulado.push(linha);
      if (acumulado.length > 3) acumulado.shift();
    }
  }

  return { numero, data, fornecedor, itens };
}

export function vincularItens(itens: PedidoItem[], skus: Sku[], produtos: Produto[]): PedidoItem[] {
  return itens.map((item) => {
    if (!item.sku) return item;
    const codigo = item.sku.trim().toUpperCase();
    const skuCad = skus.find((s) => s.sku.trim().toUpperCase() === codigo);
    const porLista = produtos.find((p) =>
      (p.skus ?? []).some((s) => s.trim().toUpperCase() === codigo),
    );
    const porTipo = skuCad ? produtos.find((p) => p.tipo && p.tipo === skuCad.tipo) : undefined;
    return {
      ...item,
      tipo: skuCad?.tipo ?? null,
      produto_id: porLista?.id ?? porTipo?.id ?? null,
    };
  });
}

export async function extrairTextoPdf(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const linhas: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const porY = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] ?? 0);
      const chave: number = [...porY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      const arr = porY.get(chave) ?? [];
      arr.push({ x: item.transform[4] ?? 0, str: item.str });
      porY.set(chave, arr);
    }
    const ys = [...porY.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const arr = (porY.get(y) ?? []).sort((a, b) => a.x - b.x);
      linhas.push(arr.map((a) => a.str).join(" "));
    }
  }
  return linhas;
}
