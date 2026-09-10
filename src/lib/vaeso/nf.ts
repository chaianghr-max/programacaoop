export type NfItem = { sku: string; descricao: string; quantidade: number };

export type NfParseada = {
  numero: string | null;
  data: string | null;
  emitente: string | null;
  itens: NfItem[];
};

const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

const ITEM_RE =
  /^([A-Z0-9][A-Z0-9._\-\/]{2,19})\s+(.+?)\s+(\d{8})\s+\d{2,3}\s+\d{4}\s+[A-ZÇ]{2,3}\s+((?:\d{1,3}\.)*\d+,\d+)/i;

/** Interpreta as linhas de texto de uma DANFE (NF-e) emitida pela PKS. */
export function parseNfLinhas(linhasBrutas: string[]): NfParseada {
  const linhas = linhasBrutas.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  let numero: string | null = null;
  let data: string | null = null;
  let emitente: string | null = null;
  const itens: NfItem[] = [];

  for (const linha of linhas) {
    if (!numero) {
      const m = linha.match(/N[ºo°]\.?\s*(\d{1,3}(?:\.\d{3})+)/);
      if (m?.[1]) numero = String(Number(m[1].replace(/\./g, "")));
    }
    if (!data) {
      const m = linha.match(/EMISS[ÃA]O:?\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m?.[1]) data = m[1];
    }
    if (!emitente) {
      const m = linha.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
      if (m?.[1]) emitente = m[1].trim();
    }

    const item = linha.match(ITEM_RE);
    if (item) {
      const sku = (item[1] ?? "").toUpperCase();
      const quantidade = parseNum(item[4] ?? "0");
      if (!quantidade) continue;
      const existente = itens.find((i) => i.sku === sku);
      if (existente) existente.quantidade += quantidade;
      else itens.push({ sku, descricao: (item[2] ?? "").trim(), quantidade });
    }
  }

  if (!data) {
    const m = linhas.join(" ").match(/(\d{2}\/\d{2}\/\d{4})/);
    if (m?.[1]) data = m[1];
  }

  return { numero, data, emitente, itens };
}
