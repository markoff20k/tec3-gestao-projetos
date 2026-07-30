# Análise Completa da Aplicação e Proposta de Relatórios — TEC3 Gestão de Projetos e Propostas

Documento gerado a partir de análise técnica completa do sistema (schema de dados, RBAC, páginas existentes, dashboards e rotas de API), com foco em identificar relatórios de alto impacto para os três perfis de usuário: **Comercial**, **Projetos** e **Admin**.

---

## 1. Visão geral da arquitetura de dados

A aplicação usa **PostgreSQL + Prisma** (server/ + client/ + shared/), com os seguintes modelos centrais:

**Comercial:** `Client`, `Proposal` (com `status`: em_elaboracao/em_analise/com_sucesso/sucesso_aditivo/nao_sucesso/cancelada/declinio; `type`: fixed_price/appropriation/umbrella/service_order; campos como `totalValue`, `estimatedHours`, `sentDate`, `dueDate`, `coordinatorId/Name`, `umbrellaRef`, `expectation`, `riskAssessment`, `termMonths`, `mainType`, `proposalOrigin`), `ProposalCategoryValue` (valor + horas orçadas por categoria profissional dentro de uma proposta — funciona como uma "tabela de rate card" por proposta), `ProposalExpense`, `ProposalAdditive`, `ProposalFavorite`.

**Execução/Projetos:** `Project` (código T-ano-sequencial, `status`, `budgetHours`, `budgetValue`, `dailyLimitHours`, `requiresApproval`, `setupStatus`, `tapStatus`, `coordinatorId`), `ProjectMember` (alocação de equipe), `ProjectTap` (documento gerado), `TimeEntry` (horas apontadas: `collaboratorId`, `costCenterId`, `entryDate`, `hours`, `status` pending/approved/rejected, `approvedById`, `rejectionReason`), `CostCenter`.

**Transversal:** `User` (role admin/commercial/projects, `professionalCategoryId` — cada usuário tem uma categoria profissional que carrega um valor/hora usado nas propostas), `UserActivity` (auditoria/login), `Notification`, `EmailOutbox` (fila de envio de e-mails do TAP).

## 2. RBAC (papéis)

- **admin**: acesso irrestrito a tudo, incluindo `/reports` (dashboard consolidado) e telas administrativas (Centros de Custo, Categorias, Usuários).
- **commercial**: Propostas, Clientes, dashboard comercial (`/api/dashboard/commercial`).
- **projects**: Projetos, Lançar Horas, Aprovar Horas, Indicadores de Projeto (`/api/dashboard/projects`), Centros de Custo (somente leitura).

## 3. O que já existe hoje (para não duplicar)

**Dashboard Comercial** (`/api/dashboard/commercial`): propostas por status no período, taxa de sucesso (período e histórica), valor aprovado, tendência de valor aprovado e contagem de propostas ao longo do tempo, comparação vs período anterior, horas lançadas/aprovadas/pendentes do mês, taxa de aprovação de horas.

**Dashboard Projetos** (`/api/dashboard/projects`): projetos por status, horas lançadas/aprovadas/pendentes do mês, taxa de aprovação, tendência de horas aprovadas, comparação vs período anterior.

**Dashboard Admin** (`/api/reports/dashboard`): tudo dos dois acima + funil comercial (elaboração/análise/ganho/perdido) + top 5 clientes por valor aprovado.

**Página Indicadores de Projeto** (`/projects/indicators`, role projects) — já é um mini-BI customizável (drag-and-drop de widgets): KPIs gerais, distribuição por status, orçado x consumido (horas), tendência de consumo (burn-down acumulado), mapa de risco operacional (score por projeto), visão executiva CEO (desvio % estimado).

**Página Relatórios** (`/reports`, admin) — só 4 cards simples: Propostas por Status, Projetos por Status, Resumo Financeiro, Clientes.

> Conclusão: o sistema já cobre bem a **visão gerencial de topo** (status, volume, taxa de sucesso, tendência temporal). O que falta é **granularidade operacional acionável** — relatórios que respondam "quem", "onde está o gargalo", "onde está vazando margem/tempo".

---

## 4. Relatórios sugeridos — ótica COMERCIAL (perfil que trabalha com propostas)

1. **Ranking de responsáveis/coordenadores comerciais** — propostas ganhas x perdidas, valor aprovado total, ticket médio, taxa de conversão individual. Fonte: `Proposal.coordinatorId/coordinatorName` + `status` + `totalValue`.

2. **Ciclo de vida da proposta (tempo de funil)** — tempo médio entre `createdAt` → `sentDate` → data de fechamento (com_sucesso/nao_sucesso), segmentado por tipo de contrato e por cliente.

3. **Aging de propostas em aberto** — lista consolidada de propostas em `em_elaboracao`/`em_analise` ordenadas por proximidade do `dueDate`, com dias restantes/vencidos, agrupadas por responsável.

4. **Análise de motivo de perda** — usa `status = nao_sucesso/declinio` cruzado com `expectation`, `riskAssessment` e texto livre — top motivos de não-conversão.

5. **Mix e desempenho por tipo de contrato** — comparativo fixed_price x appropriation x umbrella x service_order: qual gera mais valor aprovado, maior taxa de sucesso, maior ticket médio.

6. **Rastreabilidade Guarda-chuva → Ordens de Serviço** — usando `umbrellaRef`: quanto de valor/horas já foi "puxado" via OS de um contrato guarda-chuva específico.

7. **Sazonalidade histórica** — o banco tem propostas desde 2010; comparativo YoY de propostas ganhas/valor por mês/ano ajuda em previsão de demanda e metas.

8. **Funil por especialista/categoria profissional** — cruzando `ProposalCategoryValue` nas propostas ganhas, para entender qual perfil profissional está sendo mais vendido/cotado.

---

## 5. Relatórios sugeridos — ótica PROJETOS (gerencia projetos, aprova horas)

1. **Utilização/ocupação de colaboradores** — horas apontadas por colaborador (aprovadas) vs capacidade teórica (dias úteis x `dailyLimitHours` do(s) projeto(s) em que está alocado via `ProjectMember`). Hoje só existe "horas por colaborador" dentro do detalhe de UM projeto; falta visão consolidada cross-projeto por pessoa.

2. **SLA de aprovação de horas** — tempo médio entre `TimeEntry.createdAt` e `approvedAt`, por aprovador e por projeto.

3. **Taxa e motivos de rejeição de horas** — % de horas rejeitadas por colaborador/projeto, com agregação dos `rejectionReason` mais comuns.

4. **Margem/rentabilidade real por projeto** — cruzar `budgetValue`/`budgetHours` do projeto com o custo real estimado (horas aprovadas × valor/hora da categoria profissional do colaborador, vindo de `ProposalCategoryValue`/`professionalCategoryId`). Potencialmente o relatório de **maior impacto financeiro**: hoje o sistema só mostra "consumido x orçado em horas", nunca em R$ real vs orçado.

5. **Alerta de estouro de orçamento** — projetos que já consumiram (ou vão consumir, em tendência) mais horas/valor do que o orçado, com projeção de data de estouro baseada no burn rate atual.

6. **Saúde de onboarding (TAP → Setup → Execução)** — tempo médio entre `tapGeneratedAt`, `setupCompletedAt` e início real de execução (primeira `TimeEntry`), por coordenador.

7. **Consolidado por Centro de Custo** — total de horas/valor por `CostCenter` no período, comparando entre eles.

8. **Ranking de coordenadores de projeto** — número de projetos ativos sob responsabilidade, % médio de consumo do orçamento, projetos em atraso (endDate ultrapassada sem status completed).

9. **Alocação cruzada de equipe** — colaboradores alocados simultaneamente em muitos projetos (via `ProjectMember`), para identificar risco de sobrealocação/conflito de agenda.

---

## 6. Relatórios sugeridos — ótica ADMIN (visão executiva/consolidada)

1. **Receita: pipeline x reconhecida x faturável** — visão unificada: valor em propostas ainda "em_analise" (pipeline), valor "com_sucesso" (contratado), e horas aprovadas ainda não conciliadas/faturadas.

2. **Produtividade organizacional** — horas totais trabalhadas x aprovadas x rejeitadas x pendentes, agregadas por mês/categoria profissional, com custo estimado total (via rate card de `ProposalCategoryValue`).

3. **Auditoria e adoção do sistema** — usando `UserActivity`: usuários mais/menos ativos, padrões de login.

4. **Confiabilidade de envio de TAP/e-mails** — usando `EmailOutbox`: taxa de falha de envio, tempo médio até sucesso, TAPs travados em `failed`.

5. **Comparativo YoY consolidado** (propostas + projetos + horas) — histórico rico desde 2010.

6. **Qualidade da migração/dados legados** — quantos projetos são "legado sem TAP nativo" vs nativos, quantos registros têm campos essenciais nulos (coordenador, cliente, centro de custo).

7. **Cliente 360°** — para cada cliente: total histórico em propostas, taxa de conversão, projetos ativos, horas consumidas, centros de custo. Hoje o "top 5 clientes" do dashboard admin é raso; um drill-down por cliente teria mais valor estratégico.

---

## 7. Observações finais (síntese consultiva)

- **Maior gap:** ausência de qualquer relatório que traga **valor em R$ ligado a horas realmente trabalhadas** (rentabilidade/margem por projeto) — os dados já existem (`ProposalCategoryValue`, `TimeEntry`, `professionalCategoryId`), mas nunca são cruzados.
- **Segundo gap:** falta de **granularidade por pessoa** (responsável comercial, coordenador de projeto, colaborador) — hoje quase tudo é agregado por status/período, sem ranking individual.
- **Terceiro gap:** falta de **tempo/SLA de processo** (ciclo de venda, tempo de aprovação de horas, tempo de onboarding) — os timestamps já existem em quase todas as tabelas, faltando apenas cruzá-los como duração.
