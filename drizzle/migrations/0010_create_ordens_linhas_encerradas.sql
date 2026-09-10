CREATE TABLE public.ordens_linhas_encerradas (
  ordem_id text NOT NULL,
  sku text NOT NULL,
  encerrada boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (ordem_id, sku)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_linhas_encerradas TO authenticated;
GRANT ALL ON public.ordens_linhas_encerradas TO service_role;

ALTER TABLE public.ordens_linhas_encerradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read linhas encerradas" ON public.ordens_linhas_encerradas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pks admin insert linhas encerradas" ON public.ordens_linhas_encerradas
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_pks(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pks admin update linhas encerradas" ON public.ordens_linhas_encerradas
  FOR UPDATE TO authenticated
  USING (public.pode_pks(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.pode_pks(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pks admin delete linhas encerradas" ON public.ordens_linhas_encerradas
  FOR DELETE TO authenticated
  USING (public.pode_pks(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));