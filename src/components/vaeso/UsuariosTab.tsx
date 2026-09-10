import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ABAS_PERM, type PermissoesAbas } from "@/lib/vaeso/permissoes";
import {
  alterarSenha,
  criarUsuario,
  definirPermissoesAbas,
  excluirUsuario,
  listarUsuarios,
  type Permissao,
} from "@/lib/vaeso/usuarios.functions";

const PERFIS: Array<{ id: Permissao; label: string }> = [
  { id: "leitura", label: "Somente visualização" },
  { id: "pks", label: "Editar PKS e Estoque PKS" },
  { id: "admin", label: "Editar tudo (Diretoria)" },
];

export function UsuariosTab() {
  const qc = useQueryClient();
  const listar = useServerFn(listarUsuarios);
  const criar = useServerFn(criarUsuario);
  const definir = useServerFn(definirPermissoesAbas);
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
    mutationFn: (v: { userId: string; permissoes: PermissoesAbas }) => definir({ data: v }),
    onSuccess: () => {
      toast.success("Permissões atualizadas.");
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
            <Label htmlFor="nova-permissao">Perfil inicial</Label>
            <select
              id="nova-permissao"
              value={permissao}
              onChange={(e) => setPermissao(e.target.value as Permissao)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {PERFIS.map((p) => (
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

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Usuários cadastrados
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {usuarios?.map((u) => (
          <CartaoUsuario
            key={u.id}
            email={u.email}
            permissoes={u.permissoes}
            salvando={permissaoMut.isPending}
            onPermissoes={(p) => permissaoMut.mutate({ userId: u.id, permissoes: p })}
            onSenha={(s) => senhaMut.mutate({ userId: u.id, senha: s })}
            onExcluir={() => {
              if (confirm(`Excluir o acesso de ${u.email.split("@")[0]}?`)) {
                excluirMut.mutate(u.id);
              }
            }}
          />
        ))}
      </section>
    </div>
  );
}

function CartaoUsuario({
  email,
  permissoes,
  salvando,
  onPermissoes,
  onSenha,
  onExcluir,
}: {
  email: string;
  permissoes: PermissoesAbas;
  salvando: boolean;
  onPermissoes: (p: PermissoesAbas) => void;
  onSenha: (s: string) => void;
  onExcluir: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [local, setLocal] = useState<PermissoesAbas>(permissoes);

  useEffect(() => setLocal(permissoes), [permissoes]);

  const alterado = ABAS_PERM.some((a) => local[a.id] !== permissoes[a.id]);
  const definirTodas = (nivel: "ver" | "editar") =>
    setLocal(Object.fromEntries(ABAS_PERM.map((a) => [a.id, nivel])) as PermissoesAbas);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold capitalize">{email.split("@")[0]}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => definirTodas("ver")}>
            Tudo visualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => definirTodas("editar")}>
            Tudo alterar
          </Button>
          <Button variant="destructive" size="sm" onClick={onExcluir}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ABAS_PERM.map((aba) => (
          <div
            key={aba.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
          >
            <span className="text-sm">{aba.label}</span>
            <select
              value={local[aba.id]}
              onChange={(e) =>
                setLocal((atual) => ({ ...atual, [aba.id]: e.target.value as "ver" | "editar" }))
              }
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="ver">Somente visualizar</option>
              <option value="editar">Alterar / excluir</option>
            </select>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!alterado || salvando} onClick={() => onPermissoes(local)}>
          Salvar permissões
        </Button>
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
          Salvar senha
        </Button>
      </div>
    </div>
  );
}
