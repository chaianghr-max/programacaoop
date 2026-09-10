import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  alterarSenha,
  criarUsuario,
  definirPermissao,
  excluirUsuario,
  listarUsuarios,
  type Permissao,
} from "@/lib/vaeso/usuarios.functions";

const PERMISSOES: Array<{ id: Permissao; label: string }> = [
  { id: "leitura", label: "Somente visualização" },
  { id: "pks", label: "Editar PKS e Estoque PKS" },
  { id: "admin", label: "Editar tudo (Diretoria)" },
];

export function UsuariosTab() {
  const qc = useQueryClient();
  const listar = useServerFn(listarUsuarios);
  const criar = useServerFn(criarUsuario);
  const definir = useServerFn(definirPermissao);
  const excluir = useServerFn(excluirUsuario);
  const trocarSenha = useServerFn(alterarSenha);

  const { data: usuarios, isLoading, error } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listar(),
  });

  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [permissao, setPermissao] = useState<Permissao>("leitura");

  const recarregar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });

  const criarMut = useMutation({
    mutationFn: () => criar({ data: { nome, senha, permissao } }),
    onSuccess: () => {
      toast.success("Usuário criado.");
      setNome("");
      setSenha("");
      setPermissao("leitura");
      void recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const permissaoMut = useMutation({
    mutationFn: (v: { userId: string; permissao: Permissao }) => definir({ data: v }),
    onSuccess: () => {
      toast.success("Permissão atualizada.");
      void recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMut = useMutation({
    mutationFn: (userId: string) => excluir({ data: { userId } }),
    onSuccess: () => {
      toast.success("Acesso excluído.");
      void recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const senhaMut = useMutation({
    mutationFn: (v: { userId: string; senha: string }) => trocarSenha({ data: v }),
    onSuccess: () => toast.success("Senha alterada."),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Novo usuário
        </h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            criarMut.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="novo-nome">Login</Label>
            <Input
              id="novo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Luana"
              className="w-44"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nova-senha">Senha</Label>
            <Input
              id="nova-senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-44"
              minLength={6}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nova-permissao">Permissão</Label>
            <select
              id="nova-permissao"
              value={permissao}
              onChange={(e) => setPermissao(e.target.value as Permissao)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {PERMISSOES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={criarMut.isPending}>
            {criarMut.isPending ? "Criando..." : "Criar acesso"}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Usuários cadastrados
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {usuarios && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Usuário</th>
                <th className="py-2">Permissão</th>
                <th className="py-2">Nova senha</th>
                <th className="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <LinhaUsuario
                  key={u.id}
                  email={u.email}
                  permissao={u.permissao}
                  onPermissao={(p) => permissaoMut.mutate({ userId: u.id, permissao: p })}
                  onSenha={(s) => senhaMut.mutate({ userId: u.id, senha: s })}
                  onExcluir={() => {
                    if (confirm(`Excluir o acesso de ${u.email.split("@")[0]}?`)) {
                      excluirMut.mutate(u.id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function LinhaUsuario({
  email,
  permissao,
  onPermissao,
  onSenha,
  onExcluir,
}: {
  email: string;
  permissao: Permissao;
  onPermissao: (p: Permissao) => void;
  onSenha: (s: string) => void;
  onExcluir: () => void;
}) {
  const [senha, setSenha] = useState("");
  return (
    <tr className="border-b border-border/60 even:bg-muted/40">
      <td className="py-2 font-medium capitalize">{email.split("@")[0]}</td>
      <td className="py-2">
        <select
          value={permissao}
          onChange={(e) => onPermissao(e.target.value as Permissao)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {PERMISSOES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2">
        <div className="flex gap-2">
          <Input
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="nova senha"
            className="h-9 w-40"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={senha.length < 6}
            onClick={() => {
              onSenha(senha);
              setSenha("");
            }}
          >
            Salvar
          </Button>
        </div>
      </td>
      <td className="py-2 text-right">
        <Button variant="destructive" size="sm" onClick={onExcluir}>
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  );
}
