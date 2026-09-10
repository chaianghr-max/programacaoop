CREATE OR REPLACE FUNCTION public.pks_estornar_entrega(_entrega_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ordem_id text;
  _sku text;
  _quantidade numeric;
  _status text;
  _total numeric := 0;
BEGIN
  IF NOT public.pode_pks(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para estornar entregas';
  END IF;

  SELECT ordem_id, sku, quantidade, status
    INTO _ordem_id, _sku, _quantidade, _status
  FROM public.pks_entregas
  WHERE id = _entrega_id AND status <> 'cancelado'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega não encontrada';
  END IF;

  IF _status = 'aceito' THEN
    UPDATE public.ordens_entregas
      SET qtde_entregue = GREATEST(0, COALESCE(qtde_entregue, 0) - _quantidade),
          entregue = false,
          updated_at = now()
      WHERE ordem_id = _ordem_id AND sku = _sku
      RETURNING qtde_entregue INTO _total;
  END IF;

  UPDATE public.pks_entregas
    SET status = 'cancelado', accepted_at = NULL
    WHERE id = _entrega_id;

  RETURN COALESCE(_total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.pks_devolver_linha(_ordem_id text, _sku text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer := 0;
BEGIN
  IF NOT public.pode_pks(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para devolver entregas';
  END IF;

  UPDATE public.pks_entregas
    SET status = 'pendente', accepted_at = NULL
    WHERE ordem_id = _ordem_id
      AND upper(btrim(sku)) = upper(btrim(_sku))
      AND status = 'aceito';
  GET DIAGNOSTICS _n = ROW_COUNT;

  UPDATE public.ordens_entregas
    SET qtde_entregue = 0, entregue = false, updated_at = now()
    WHERE ordem_id = _ordem_id AND upper(btrim(sku)) = upper(btrim(_sku));

  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pks_estornar_entrega(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pks_devolver_linha(text, text) TO authenticated;