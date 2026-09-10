import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Permissao = "admin" | "pks" | "leitura";

export type UsuarioLinha = {
  id: string;
  email: string;
  permissao: Permissao;
  criadoEm: string;
};

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
      mapa.set(p.user_id, p.role);
    }
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      permissao: mapa.get(u.id) ?? "leitura",
      criadoEm: u.created_at,
    }));
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
    if (data.permissao !== "leitura") {
      const { error: erroPapel } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: criado.user.id, role: data.permissao });
      if (erroPapel) throw new Error(erroPapel.message);
    }
    return { id: criado.user.id, email };
  });

export const definirPermissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid(), permissao: z.enum(["admin", "pks", "leitura"]) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await garantirAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (data.permissao !== "leitura") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.permissao });
      if (error) throw new Error(error.message);
    }
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
    return { ok: true };
  });
