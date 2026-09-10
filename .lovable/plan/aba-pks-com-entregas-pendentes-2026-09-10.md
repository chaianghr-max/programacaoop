# Aba PKS com entregas pendentes

## Objetivo
Criar a aba **PKS**, à direita de **Programação**, mostrando somente ordens da empresa PKS Manufaturados Ltda. A aba compartilhará automaticamente as ordens importadas na Programação.

## Experiência da aba PKS
- Mostrar as ordens PKS no topo, com seleção individual e por empresa.
- Exibir tabela compacta por SKU com busca por SKU, descrição e tipo.
- Organizar as colunas nesta prioridade: identificação e cálculos sutis à esquerda; **Qtde OC**, **Entrega** e **Saldo** em destaque.
- Cada produto terá um controle no canto esquerdo para abrir/recolher sua estrutura.
- A estrutura começará oculta e mostrará componente, matéria-prima, consumo, horas, Qtde OC, quantidade produzida e saldo.
- Permitir lançamentos acumulativos: cada novo valor soma ao histórico já informado.
- Controlar quantidades dos subitens separadamente por ordem e SKU; esses valores não alteram a Programação.
- Não exibir a tabela inferior de totais de matéria-prima.

## Sincronização com Programação
- Um lançamento no item principal da PKS criará uma entrega pendente para a ordem e o SKU correspondentes.
- Na Programação, a ordem receberá um sinal visual quando houver entrega pendente.
- A linha do produto mostrará a quantidade pendente e uma ação de **Aceitar**.
- Ao aceitar, a quantidade será somada à entrega oficial já registrada, atualizando saldo e percentual da ordem.
- Não haverá rejeição nem ajuste na Programação; o lançamento permanecerá pendente até ser aceito.
- Entregas de componentes/subníveis permanecerão somente na aba PKS.

## Dados e segurança
- Criar uma tabela de lançamentos dos itens principais, com ordem, SKU, quantidade, status pendente/aceito, datas e usuário quando disponível.
- Criar uma tabela separada para o progresso dos componentes por ordem, SKU e componente.
- Garantir acesso somente a usuários autenticados, com permissões explícitas e regras de acesso.
- Preservar a tabela atual de entregas oficiais da Programação.

## Implementação técnica
- Extrair os tipos e a montagem das ordens para um módulo compartilhado entre Programação e PKS.
- Criar `PksTab` reutilizando os cálculos existentes de SKU, componentes, consumo e horas.
- Adicionar consultas e atualizações de cache para que as duas abas reflitam alterações sem recarregar a página.
- Adaptar a Programação para consultar pendências PKS, sinalizar ordens e aceitar lançamentos de forma idempotente.
- Adicionar a aba no cabeçalho e manter o estilo compacto e zebrado existente.

## Validação
- Confirmar que uma nova ordem PKS importada na Programação aparece automaticamente na PKS.
- Testar busca, seleção, expansão da estrutura e lançamentos acumulativos.
- Confirmar que componente produzido não altera a Programação.
- Confirmar que item principal aparece pendente, é aceito uma única vez e soma corretamente à entrega oficial.
- Validar totais, saldos, percentuais, telas compactas e ausência de erros.
