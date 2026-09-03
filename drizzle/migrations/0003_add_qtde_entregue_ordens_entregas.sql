ALTER TABLE public.ordens_entregas ADD COLUMN IF NOT EXISTS qtde_entregue numeric NOT NULL DEFAULT 0;

UPDATE public.ordens_entregas SET qtde_entregue = 0 WHERE qtde_entregue IS NULL;