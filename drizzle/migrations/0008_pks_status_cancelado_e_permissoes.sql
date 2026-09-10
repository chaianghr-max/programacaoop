ALTER TABLE public.pks_entregas DROP CONSTRAINT IF EXISTS pks_entregas_status_check;
ALTER TABLE public.pks_entregas ADD CONSTRAINT pks_entregas_status_check
  CHECK (status = ANY (ARRAY['pendente'::text, 'aceito'::text, 'cancelado'::text]));

ALTER TABLE public.pks_componentes_entregas DROP CONSTRAINT IF EXISTS pks_componentes_entregas_status_check;
ALTER TABLE public.pks_componentes_entregas ADD CONSTRAINT pks_componentes_entregas_status_check
  CHECK (status = ANY (ARRAY['ativo'::text, 'cancelado'::text]));

CREATE OR REPLACE FUNCTION public.pode_pks(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','pks'))
$$;

DROP POLICY IF EXISTS "auth insert pks entregas" ON public.pks_entregas;
DROP POLICY IF EXISTS "auth update pks entregas" ON public.pks_entregas;
CREATE POLICY "pks insert entregas" ON public.pks_entregas
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.pode_pks(auth.uid()));
CREATE POLICY "pks update entregas" ON public.pks_entregas
  FOR UPDATE TO authenticated USING (public.pode_pks(auth.uid())) WITH CHECK (public.pode_pks(auth.uid()));

DROP POLICY IF EXISTS "auth insert pks componentes" ON public.pks_componentes_entregas;
DROP POLICY IF EXISTS "auth update pks componentes" ON public.pks_componentes_entregas;
CREATE POLICY "pks insert componentes" ON public.pks_componentes_entregas
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.pode_pks(auth.uid()));
CREATE POLICY "pks update componentes" ON public.pks_componentes_entregas
  FOR UPDATE TO authenticated USING (public.pode_pks(auth.uid())) WITH CHECK (public.pode_pks(auth.uid()));

DROP POLICY IF EXISTS "auth insert baixas" ON public.pks_estoque_baixas;
DROP POLICY IF EXISTS "auth delete baixas" ON public.pks_estoque_baixas;
CREATE POLICY "pks insert baixas" ON public.pks_estoque_baixas
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.pode_pks(auth.uid()));
CREATE POLICY "pks delete baixas" ON public.pks_estoque_baixas
  FOR DELETE TO authenticated USING (public.pode_pks(auth.uid()));