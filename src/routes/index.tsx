import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EstoquePksTab } from "@/components/vaeso/EstoquePksTab";
import { LoginCard } from "@/components/vaeso/LoginCard";
import { MpTab } from "@/components/vaeso/MpTab";
import { PksTab } from "@/components/vaeso/PksTab";
import { ProdutosTab } from "@/components/vaeso/ProdutosTab";
import { ProgramacaoTab } from "@/components/vaeso/ProgramacaoTab";
import { SkusTab } from "@/components/vaeso/SkusTab";
import { UsuariosTab } from "@/components/vaeso/UsuariosTab";
import { supabase } from "@/integrations/supabase/client";
import { useDados, useSalvar } from "@/lib/vaeso/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel VAESO — Produção & Compras" },
      {
        name: "description",
        content:
          "Painel VAESO para produção e compras: matérias-primas, ficha de produtos, SKUs e programação de fábrica.",
      },
      { property: "og:title", content: "Painel VAESO — Produção & Compras" },
      {
        property: "og:description",
        content: "Controle de matérias-primas, produtos, SKUs e programação de produção da VAESO.",
      },
      { name: "robots", content: "noindex" },
       { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

const ABAS = [
  { id: "mp", label: "MP" },
  { id: "produtos", label: "Ficha de Produtos" },
  { id: "skus", label: "SKU's" },
  { id: "programacao", label: "Programação" },
  { id: "pks", label: "PKS" },
  { id: "estoque-pks", label: "Estoque PKS" },
  { id: "usuarios", label: "Usuários" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function Painel() {
  const [pronto, setPronto] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [papel, setPapel] = useState<"admin" | "pks" | "leitura">("leitura");
  const [aba, setAba] = useState<AbaId>("mp");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setUserId(data.session?.user.id ?? null);
      setPronto(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setPapel("leitura");
      return;
    }
    void supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        const papeis = (data ?? []).map((r) => r.role as string);
        setPapel(papeis.includes("admin") ? "admin" : papeis.includes("pks") ? "pks" : "leitura");
      });
  }, [userId]);

  const logado = !!email;
  const { data: dados, isLoading, error } = useDados(logado);
  const salvarMut = useSalvar();
  const ehDiretoria = papel === "admin" && !!email && email.startsWith("diretoria");
  const podeEditarGeral = papel === "admin";
  const salvar = (fn: () => PromiseLike<unknown>) => {
    if (!podeEditarGeral) {
      toast.error("Seu acesso não permite editar esta aba.");
      return;
    }
    salvarMut.mutate(fn);
  };

  if (!pronto) return <div className="min-h-screen bg-muted" />;
  if (!logado) return <LoginCard />;

  const nome = (email?.split("@")[0] ?? "").replace(/^./, (c) => c.toUpperCase());


  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight">VAESO · Produção &amp; Compras</h1>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="opacity-90">
              {nome}
              {!podeEditarGeral && " · somente leitura (exceto PKS)"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void supabase.auth.signOut()}
            >
              <LogOut className="mr-1 size-4" /> Sair
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1500px] gap-1 px-4">
          {ABAS.filter((a) => a.id !== "usuarios" || ehDiretoria).map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
                aba === a.id
                  ? "bg-muted text-foreground"
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando dados...</p>}
        {error && <p className="text-sm text-destructive">Erro ao carregar os dados.</p>}
        {dados && (
          <>
            {aba === "mp" && <MpTab dados={dados} salvar={salvar} />}
            {aba === "produtos" && <ProdutosTab dados={dados} salvar={salvar} />}
            {aba === "skus" && <SkusTab dados={dados} salvar={salvar} />}
            {aba === "programacao" && <ProgramacaoTab dados={dados} salvar={salvar} />}
            {aba === "pks" && <PksTab dados={dados} />}
            {aba === "estoque-pks" && <EstoquePksTab dados={dados} />}
            {aba === "usuarios" && ehDiretoria && <UsuariosTab />}
          </>
        )}
      </main>
    </div>
  );
}
