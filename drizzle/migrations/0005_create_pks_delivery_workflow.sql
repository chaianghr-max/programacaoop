CREATE TABLE public.pks_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id text NOT NULL,
  sku text NOT NULL,
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.pks_entregas TO authenticated;
GRANT ALL ON public.pks_entregas TO service_role;

ALTER TABLE public.pks_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read pks entregas"
ON public.pks_entregas FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert pks entregas"
ON public.pks_entregas FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "auth update pks entregas"
ON public.pks_entregas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX pks_entregas_ordem_sku_idx ON public.pks_entregas (ordem_id, sku);
CREATE INDEX pks_entregas_status_idx ON public.pks_entregas (status);

CREATE TABLE public.pks_componentes_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id text NOT NULL,
  sku text NOT NULL,
  componente_id text NOT NULL REFERENCES public.componentes(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pks_componentes_entregas TO authenticated;
GRANT ALL ON public.pks_componentes_entregas TO service_role;

ALTER TABLE public.pks_componentes_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read pks componentes"
ON public.pks_componentes_entregas FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert pks componentes"
ON public.pks_componentes_entregas FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE INDEX pks_componentes_ordem_sku_idx ON public.pks_componentes_entregas (ordem_id, sku, componente_id);

CREATE OR REPLACE FUNCTION public.pks_aceitar_entrega(_entrega_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _ordem_id text;
  _sku text;
  _quantidade numeric;
  _total numeric;
BEGIN
  SELECT ordem_id, sku, quantidade
    INTO _ordem_id, _sku, _quantidade
  FROM public.pks_entregas
  WHERE id = _entrega_id AND status = 'pendente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega pendente não encontrada';
  END IF;

  INSERT INTO public.ordens_entregas (ordem_id, sku, entregue, qtde_entregue, updated_at)
  VALUES (_ordem_id, _sku, false, _quantidade, now())
  ON CONFLICT (ordem_id, sku) DO UPDATE
    SET qtde_entregue = COALESCE(public.ordens_entregas.qtde_entregue, 0) + EXCLUDED.qtde_entregue,
        updated_at = now();

  UPDATE public.pks_entregas
  SET status = 'aceito', accepted_at = now()
  WHERE id = _entrega_id;

  SELECT qtde_entregue INTO _total
  FROM public.ordens_entregas
  WHERE ordem_id = _ordem_id AND sku = _sku;

  RETURN _total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pks_aceitar_entrega(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pks_aceitar_entrega(uuid) TO service_role;