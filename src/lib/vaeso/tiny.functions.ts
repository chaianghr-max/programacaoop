import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const EMPRESAS_TINY = [
  "PLASTSERV INDUSTRIA DE PLASTICOS LTDA EPP",
  "PKS MANUFATURADOS LTDA",
  "CNCFER FERRAMENTARIA LTDA",
] as const;

export type OrdemTinyItem = {
  codigo: string;
  descricao: string;
  quantidade: number;
};

export type OrdemTiny = {
  id: string;
  numero: string;
  empresa: string;
  data: string;
  situacao: string;
  itens: OrdemTinyItem[];
};

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

const EMPRESAS_NORM = new Map(EMPRESAS_TINY.map((e) => [normalizar(e), e]));

type OcResumo = {
  id?: number | string;
  numero?: number | string;
  numeroPedido?: number | string;
  data?: string;
  dataPedido?: string;
  situacao?: number | string;
  fornecedor?: { nome?: string; razaoSocial?: string };
};

type OcDetalhe = OcResumo & {
  itens?: Array<{
    produto?: { codigo?: string; descricao?: string; nome?: string };
    quantidade?: number;
    preco?: number;
  }>;
};

export const statusTiny = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ conectado: boolean }> => {
    const { lerTokens } = await import("./tiny-v3.server");
    return { conectado: (await lerTokens()) !== null };
  },
);

export const urlAutorizacaoTiny = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ redirectUri: z.string().url() }).parse(data))
  .handler(async ({ data }): Promise<string> => {
    const clientId = process.env["TINY_CLIENT_ID"];
    if (!clientId) throw new Error("TINY_CLIENT_ID ausente");
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: data.redirectUri,
      scope: "openid",
      response_type: "code",
    });
    return `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${q}`;
  });

export const trocarCodigoTiny = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ code: z.string(), redirectUri: z.string().url() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { trocarCodigo } = await import("./tiny-v3.server");
    await trocarCodigo(data.code, data.redirectUri);
    return { ok: true };
  });

export const desconectarTiny = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_prefs").delete().eq("chave", "tiny_oauth");
  return { ok: true };
});

export const listarOrdensTiny = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrdemTiny[]> => {
    const { tinyV3 } = await import("./tiny-v3.server");

    const resumos: OcResumo[] = [];
    let offset = 0;
    const limit = 100;
    for (;;) {
      const pagina = await tinyV3<{
        itens?: OcResumo[];
        paginacao?: { total?: number; limit?: number; offset?: number };
      }>(`/ordem-compra?situacao=0&orderBy=numero&limit=${limit}&offset=${offset}`);
      const itens = pagina.itens ?? [];
      resumos.push(...itens);
      const total = pagina.paginacao?.total ?? resumos.length;
      offset += itens.length;
      if (itens.length < limit || offset >= total) break;
    }

    const ordens: OrdemTiny[] = [];
    for (const r of resumos) {
      const nomeFornecedor = r.fornecedor?.nome ?? r.fornecedor?.razaoSocial ?? "";
      const empresa = EMPRESAS_NORM.get(normalizar(nomeFornecedor));
      if (!empresa) continue;
      ordens.push({
        id: String(r.id ?? ""),
        numero: String(r.numero ?? r.numeroPedido ?? ""),
        empresa,
        data: r.data ?? r.dataPedido ?? "",
        situacao: String(r.situacao ?? ""),
        itens: [],
      });
    }

    for (const ordem of ordens) {
      if (!ordem.id) continue;
      const det = await tinyV3<OcDetalhe>(`/ordem-compra/${ordem.id}`);
      ordem.itens = (det.itens ?? []).map((i) => ({
        codigo: (i.produto?.codigo ?? "").trim(),
        descricao: i.produto?.descricao ?? i.produto?.nome ?? "",
        quantidade: Number(i.quantidade ?? 0),
      }));
    }

    return ordens.sort((a, b) => Number(b.numero) - Number(a.numero));
  },
);
