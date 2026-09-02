import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { trocarCodigoTiny } from "@/lib/vaeso/tiny.functions";

export const Route = createFileRoute("/tiny-callback")({
  component: TinyCallbackPage,
  head: () => ({
    meta: [{ title: "Conectar Tiny — Programação OP" }],
  }),
});

function TinyCallbackPage() {
  const search = useSearch({ strict: false }) as { code?: string; error?: string };
  const navigate = useNavigate();
  const trocar = useServerFn(trocarCodigoTiny);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const code = search.code;
    if (!code) {
      setErro(search.error ?? "Código de autorização ausente.");
      return;
    }
    trocar({ data: { code, redirectUri: `${window.location.origin}/tiny-callback` } })
      .then(() => navigate({ to: "/" }))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
        {erro ? (
          <>
            <p className="font-semibold text-destructive">Falha ao conectar o Tiny</p>
            <p className="mt-2 text-sm text-muted-foreground">{erro}</p>
            <a href="/" className="mt-4 inline-block text-sm text-primary underline">
              Voltar ao painel
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Conectando ao Tiny…</p>
        )}
      </div>
    </div>
  );
}
