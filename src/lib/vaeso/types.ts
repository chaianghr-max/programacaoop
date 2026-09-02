export type MpItem = {
  id: string;
  descricao: string;
  fornecedor: string;
  valor_kg: number | null;
  icms: number | null;
  ipi: number | null;
};

export type Componente = {
  id: string;
  produto_id: string;
  ordem: number;
  descricao: string;
  mp: string;
  peso_g: number | null;
  valor_kg: number | null;
  cavidades: number | null;
  ciclo_s: number | null;
  injetora: string | null;
};

export type Produto = {
  id: string;
  nome: string;
  tipo: string;
  imagem: string | null;
  caixa_tipo: string | null;
  pcs_caixa: number | null;
  pcs_pallet: number | null;
  cxs_pallet: number | null;
  etiqueta: string | null;
  skus: string[];
};

export type Sku = {
  id: string;
  tipo: string;
  sku: string;
  descricao: string;
};

export type PedidoItem = {
  nome: string;
  sku: string | null;
  qtde: number;
  tipo: string | null;
  produto_id: string | null;
};

export type Pedido = {
  slot: number;
  numero: string | null;
  data: string | null;
  fornecedor: string | null;
  itens: PedidoItem[];
  importado_em: string;
};

export type ProgramacaoManual = { sku: string; quantidade: number };
