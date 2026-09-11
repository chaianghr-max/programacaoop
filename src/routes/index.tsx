export const ABAS_PERM = [
  { id: "mp", label: "MP" },
  { id: "produtos", label: "Ficha de Produtos" },
  { id: "skus", label: "SKU's" },
  { id: "programacao", label: "Programação" },
  { id: "pks", label: "PKS" },
  { id: "estoque-pks", label: "Estoque PKS" },
  { id: "expedicao", label: "Expedição" },
] as const;
 
export type AbaPerm = (typeof ABAS_PERM)[number]["id"];
export type Nivel = "ver" | "editar";
export type PermissoesAbas = Record<AbaPerm, Nivel>;
 
export type PapelBase = "admin" | "pks" | "leitura";
 
export const ABAS_ADMIN: AbaPerm[] = ["mp", "produtos", "skus", "programacao"];
export const ABAS_PKS: AbaPerm[] = ["pks", "estoque-pks", "expedicao"];
 
export function permissoesDoPapel(papel: PapelBase): PermissoesAbas {
  const base = {} as PermissoesAbas;
  for (const aba of ABAS_PERM) {
    base[aba.id] =
      papel === "admin" || (papel === "pks" && ABAS_PKS.includes(aba.id)) ? "editar" : "ver";
  }
  return base;
}
 
export function normalizarPermissoes(valor: unknown, papel: PapelBase): PermissoesAbas {
  const padrao = permissoesDoPapel(papel);
  if (!valor || typeof valor !== "object") return padrao;
  const bruto = valor as Record<string, unknown>;
  const resultado = {} as PermissoesAbas;
  for (const aba of ABAS_PERM) {
    resultado[aba.id] = bruto[aba.id] === "editar" ? "editar" : bruto[aba.id] === "ver" ? "ver" : padrao[aba.id];
  }
  return resultado;
}
 
/** Papéis de banco derivados das permissões por aba (RLS). */
export function papeisDasPermissoes(p: PermissoesAbas): Array<"admin" | "pks"> {
  const papeis: Array<"admin" | "pks"> = [];
  if (ABAS_ADMIN.some((aba) => p[aba] === "editar")) papeis.push("admin");
  else if (ABAS_PKS.some((aba) => p[aba] === "editar")) papeis.push("pks");
  return papeis;
}
 
 
