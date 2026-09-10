DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'pks');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email IN ('diretoria@vaeso.local','gisele@vaeso.local')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'pks'::public.app_role FROM auth.users WHERE email = 'luana@vaeso.local'
ON CONFLICT DO NOTHING;

-- Tabelas gerais: leitura para todos autenticados, escrita apenas admin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mp_itens','produtos','componentes','skus','programacao_manual','pedidos_importados','ordens_entregas','app_prefs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth full access ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth read ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin write ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'auth read ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', 'admin write ' || t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "auth full access prefs" ON public.app_prefs;
DROP POLICY IF EXISTS "auth full access mp_itens" ON public.mp_itens;
DROP POLICY IF EXISTS "auth full access produtos" ON public.produtos;
DROP POLICY IF EXISTS "auth full access componentes" ON public.componentes;
DROP POLICY IF EXISTS "auth full access skus" ON public.skus;
DROP POLICY IF EXISTS "auth full access programacao" ON public.programacao_manual;
DROP POLICY IF EXISTS "auth full access pedidos" ON public.pedidos_importados;
DROP POLICY IF EXISTS "auth full access ordens_entregas" ON public.ordens_entregas;