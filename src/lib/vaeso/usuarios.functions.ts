import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ABAS_PERM,
  normalizarPermissoes,
  papeisDasPermissoes,
  permissoesDoPapel,
  type PapelBase,
  type PermissoesAbas,
} from "@/lib/vaeso/permissoes";

export type Permissao = PapelBase;

export type UsuarioLinha = {
  id: string;
  email: string;
  permissao: Permissao;
  permissoes: PermissoesAbas;
  criadoEm: string;
};

const CHAVE_PREFS = "permissoes_abas";

const esquemaPermissoes = z.object(
  Object.fromEntries(ABAS_PERM.map((a) => [a.id, z.enum(["ver", "editar"])])) as Record<
    string,
    z.ZodEnum<["ver", "editar"]>
  >,
);

async function garantirAdmin(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: string) => { eq: (col: string, v: string) => Promise<{ data: unknown[] | null }> };
    };
  };
}, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) {
    throw new Error("Apenas a Diretoria pode gerenciar usuários.");
  }
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function lerPrefs(supabaseAdmin: Admin): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from("app_prefs")
    .select("valor")
    .eq("chave", CHAVE_PREFS)
    .maybeSingle();
  const valor = (data as { valor?: unknown } | null)?.valor;
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

async function gravarPrefs(supabaseAdmin: Admin, valor: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("app_prefs")
    .upsert({ chave: CHAVE_PREFS, valor: valor as never, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

async function sincronizarPapeis(supabaseAdmin: Admin, userId: string, permissoes: PermissoesAbas) {
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  const papeis = papeisDasPermissoes(permissoes);
  if (papeis.length > 0) {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert(papeis.map((role) => ({ user_id: userId, role })));
    if (error) throw new Error(error.message);
  }
}

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsuarioLinha[]> => {
    await garantirAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: papeis } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const mapa = new Map<string, Permissao>();
    for (const p of (papeis ?? []) as Array<{ user_id: string; role: Permissao }>) {
      if (p.role === "admin" || mapa.get(p.user_id) !== "admin") mapa.set(p.user_id, p.role);
    }
    const prefs = await lerPrefs(supabaseAdmin);
    return data.users.map((u) => {
      const papel = mapa.get(u.id) ?? "leitura";
      return {
        id: u.id,
        email: u.email ?? "",
        permissao: papel,
        permissoes: normalizarPermissoes(prefs[u.id], papel),
        criadoEm: u.created_at,
      };
    });
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        nome: z.string().min(2).max(40),
        senha: z.string().min(6).max(72),
        permissao: z.enum(["admin", "pks", "leitura"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await garantirAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const login = data.nome.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `${login}@vaeso.local`;
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.senha,
      email_confirm: true,
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Falha ao criar usuário.");
    const permissoes = permissoesDoPapel(data.permissao);
    await sincronizarPapeis(supabaseAdmin, criado.user.id, permissoes);
    const prefs = await lerPrefs(supabaseAdmin);
    prefs[criado.user.id] = permissoes;
    await gravarPrefs(supabaseAdmin, prefs);
    return { id: criado.user.id, email };
  });

export const definirPermissoesAbas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid(), permissoes: esquemaPermissoes }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await garantirAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const permissoes = normalizarPermissoes(data.permissoes, "leitura");
    await sincronizarPapeis(supabaseAdmin, data.userId, permissoes);
    const prefs = await lerPrefs(supabaseAdmin);
    prefs[data.userId] = permissoes;
    await gravarPrefs(supabaseAdmin, prefs);
    return { ok: true };
  });

export const alterarSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid(), senha: z.string().min(6).max(72) }).parse(data))
  .handler(async ({ context, data }) => {
    await garantirAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.senha });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await garantirAdmin(context.supabase as never, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir o próprio acesso.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    const prefs = await lerPrefs(supabaseAdmin);
    delete prefs[data.userId];
    await gravarPrefs(supabaseAdmin, prefs);
    return { ok: true };
  });
