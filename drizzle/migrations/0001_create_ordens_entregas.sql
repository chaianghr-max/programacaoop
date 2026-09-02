CREATE TABLE public.ordens_entregas (
  ordem_id text NOT NULL,
  sku text NOT NULL,
  entregue boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ordem_id, sku)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_entregas TO authenticated;
GRANT ALL ON public.ordens_entregas TO service_role;

ALTER TABLE public.ordens_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full access ordens_entregas" ON public.ordens_entregas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);