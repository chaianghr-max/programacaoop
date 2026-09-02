import { createServerFn } from "@tanstack/react-start";

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

const SITUACOES_FECHADAS = ["cancelado", "entregue", "nao entregue", "não entregue"];

async function tiny(endpoint: string, params: Record<string, string>) {
  const token = process.env["TINY_API_TOKEN"];
  if (!token) throw new Error("TINY_API_TOKEN ausente");
  const body = new URLSearchParams({ token, formato: "json", ...params });
  const res = await fetch(`https://api.tiny.com.br/api2/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { retorno?: Record<string, unknown> };
  return json.retorno ?? {};
}

export const listarOrdensTiny = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrdemTiny[]> => {
    const ordens: OrdemTiny[] = [];

    for (const empresa of EMPRESAS_TINY) {
      const retorno = (await tiny("pedidos.pesquisa.php", { cliente: empresa })) as {
        pedidos?: Array<{ pedido: Record<string, string> }>;
      };
      for (const p of retorno.pedidos ?? []) {
        const ped = p.pedido;
        const nome = (ped["nome"] ?? "").trim().toUpperCase();
        if (nome !== empresa.toUpperCase()) continue;
        const situacao = ped["situacao"] ?? "";
        if (SITUACOES_FECHADAS.includes(situacao.toLowerCase())) continue;
        ordens.push({
          id: String(ped["id"]),
          numero: String(ped["numero"] ?? ""),
          empresa,
          data: ped["data_pedido"] ?? "",
          situacao,
          itens: [],
        });
      }
    }

    for (const ordem of ordens) {
      const retorno = (await tiny("pedido.obter.php", { id: ordem.id })) as {
        pedido?: { itens?: Array<{ item: Record<string, string> }> };
      };
      ordem.itens = (retorno.pedido?.itens ?? []).map((i) => ({
        codigo: (i.item["codigo"] ?? "").trim(),
        descricao: i.item["descricao"] ?? "",
        quantidade: Number(i.item["quantidade"] ?? 0),
      }));
    }

    return ordens.sort((a, b) => Number(b.numero) - Number(a.numero));
  },
);
