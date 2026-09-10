ALTER TABLE public.pks_componentes_entregas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

CREATE POLICY "auth update pks componentes"
  ON public.pks_componentes_entregas
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.pks_estoque_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_numero text NOT NULL,
  nf_data text,
  sku text NOT NULL,
  quantidade numeric NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pks_estoque_baixas_nf_sku_idx
  ON public.pks_estoque_baixas (nf_numero, upper(sku));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pks_estoque_baixas TO authenticated;
GRANT ALL ON public.pks_estoque_baixas TO service_role;

ALTER TABLE public.pks_estoque_baixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read baixas" ON public.pks_estoque_baixas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert baixas" ON public.pks_estoque_baixas
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "auth delete baixas" ON public.pks_estoque_baixas
  FOR DELETE TO authenticated USING (true);