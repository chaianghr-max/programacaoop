CREATE TABLE public.mp_itens (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL DEFAULT '',
  fornecedor TEXT NOT NULL DEFAULT '',
  valor_kg NUMERIC,
  icms NUMERIC,
  ipi NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mp_itens TO authenticated;
GRANT ALL ON public.mp_itens TO service_role;
ALTER TABLE public.mp_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access mp_itens" ON public.mp_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.produtos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT '',
  imagem TEXT,
  caixa_tipo TEXT,
  pcs_caixa NUMERIC,
  pcs_pallet NUMERIC,
  cxs_pallet NUMERIC,
  etiqueta TEXT,
  skus TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access produtos" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.componentes (
  id TEXT PRIMARY KEY,
  produto_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL DEFAULT '',
  mp TEXT NOT NULL DEFAULT '',
  peso_g NUMERIC,
  valor_kg NUMERIC,
  cavidades NUMERIC,
  ciclo_s NUMERIC,
  injetora TEXT
);
CREATE INDEX componentes_produto_idx ON public.componentes(produto_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.componentes TO authenticated;
GRANT ALL ON public.componentes TO service_role;
ALTER TABLE public.componentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access componentes" ON public.componentes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.skus (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX skus_sku_idx ON public.skus(sku);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skus TO authenticated;
GRANT ALL ON public.skus TO service_role;
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access skus" ON public.skus FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.pedidos_importados (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 2),
  numero TEXT,
  data TEXT,
  fornecedor TEXT,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_importados TO authenticated;
GRANT ALL ON public.pedidos_importados TO service_role;
ALTER TABLE public.pedidos_importados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access pedidos" ON public.pedidos_importados FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.programacao_manual (
  sku TEXT PRIMARY KEY,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programacao_manual TO authenticated;
GRANT ALL ON public.programacao_manual TO service_role;
ALTER TABLE public.programacao_manual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access programacao" ON public.programacao_manual FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.app_prefs (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_prefs TO authenticated;
GRANT ALL ON public.app_prefs TO service_role;
ALTER TABLE public.app_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access prefs" ON public.app_prefs FOR ALL TO authenticated USING (true) WITH CHECK (true);