# Remover limite de 3 ordens na importação

## Diagnóstico (confirmado)
A tabela `pedidos_importados` ainda tem uma restrição antiga do desenho original de 3 slots:

```text
pedidos_importados_slot_check: CHECK (slot >= 0 AND slot <= 2)
```

O app calcula o próximo slot como `maior slot + 1`. Assim que já existem 3 ordens (slots 0, 1, 2), a 4ª tenta gravar `slot = 3` e o banco rejeita com o erro que você viu. Ou seja: o limite de 3 ordens que você pediu para remover ainda existia no banco de dados, mesmo não estando mais visível no código.

## Correção
1. Migration no banco removendo a restrição:
   ```sql
   ALTER TABLE public.pedidos_importados DROP CONSTRAINT pedidos_importados_slot_check;
   ```
   - Sem risco: não apaga nem altera dados, apenas remove o limite.
   - A chave primária (`slot`) é mantida, então cada ordem continua com slot único.

## Resultado esperado
- Importar PDFs de ordens sem limite de quantidade (4ª, 5ª, ... ordens funcionam).
- Nenhuma alteração visual ou de comportamento além de destravar a importação.
