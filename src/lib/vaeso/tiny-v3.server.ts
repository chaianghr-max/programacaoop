// Server-only: OAuth e chamadas da API v3 do Tiny (Olist ERP).
type TinyTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
};

const TOKEN_URL =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";
const API_BASE = "https://erp.tiny.com.br/public-api/v3";
const PREFS_KEY = "tiny_oauth";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function lerTokens(): Promise<TinyTokens | null> {
  const { data, error } = await (await admin())
    .from("app_prefs")
    .select("valor")
    .eq("chave", PREFS_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data?.valor as unknown as TinyTokens) ?? null;
}

export async function salvarTokens(t: TinyTokens) {
  const { error } = await (await admin())
    .from("app_prefs")
    .upsert({ chave: PREFS_KEY, valor: t as never, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function trocarCodigo(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env["TINY_CLIENT_ID"]!,
    client_secret: process.env["TINY_CLIENT_SECRET"]!,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Tiny OAuth: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const tokens: TinyTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000 - 60_000,
  };
  await salvarTokens(tokens);
  return tokens;
}

async function renovar(refreshToken: string): Promise<TinyTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env["TINY_CLIENT_ID"]!,
    client_secret: process.env["TINY_CLIENT_SECRET"]!,
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Tiny refresh: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const tokens: TinyTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refreshToken,
    expires_at: Date.now() + json.expires_in * 1000 - 60_000,
  };
  await salvarTokens(tokens);
  return tokens;
}

export async function tokenValido(): Promise<string> {
  const t = await lerTokens();
  if (!t)
    throw new Error(
      "TINY_NAO_AUTORIZADO: conecte a conta do Tiny para buscar as ordens de compra.",
    );
  if (t.expires_at > Date.now()) return t.access_token;
  const novo = await renovar(t.refresh_token);
  return novo.access_token;
}

export async function tinyV3<T>(path: string): Promise<T> {
  const token = await tokenValido();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Tiny API ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
