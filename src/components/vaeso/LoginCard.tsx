import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const USUARIOS: Record<string, string> = {
  Diretoria: "diretoria@vaeso.local",
  Gisele: "gisele@vaeso.local",
  Luana: "luana@vaeso.local",
};

export function LoginCard() {
  const [usuario, setUsuario] = useState("Diretoria");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const email = USUARIOS[usuario] ?? usuario;
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) setErro("Usuário ou senha inválidos.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-primary">VAESO</div>
          <p className="mt-1 text-sm text-muted-foreground">Painel de Produção &amp; Compras</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="usuario">Usuário</Label>
            <select
              id="usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.keys(USUARIOS).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
