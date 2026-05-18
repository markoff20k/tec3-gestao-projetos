# Migração Legada em Homologação

## Objetivo

Executar a carga do legado em ambiente de homologação com ordem controlada, pontos de parada e conferências mínimas antes de avançar para produção.

Este runbook parte de três premissas:

1. O dump congelado do legado é o arquivo `bdtec3.sql`.
2. O banco de homologação está vazio ou foi recriado do zero.
3. A carga será executada na raiz do repositório, com `.env` apontando para o PostgreSQL de homologação.

## Regra de operação

Para consistência alta, não avance para a próxima etapa se a etapa atual produzir `skipped`, `fallback`, `customName`, `unresolved` ou vínculos ausentes sem justificativa explícita.

## Limpeza inicial do banco

Se o ambiente já contém dados e você quer recarregar do zero sem alterar a estrutura, limpe todas as tabelas antes da migração:

```powershell
npm run db:clear -- --dry-run
npm run db:clear -- --confirm
```

Esse fluxo preserva o schema e mantém a tabela `_prisma_migrations` intacta.

## Pré-requisitos

1. Ajuste o `.env` para o banco de homologação.
2. Garanta que o dump congelado esteja disponível em um caminho sem ambiguidade. Exemplo:

```powershell
Copy-Item "C:\Users\jefer\Downloads\bdtec3 (1).sql" ".\bdtec3.sql"
```

3. Instale dependências e gere o client Prisma:

```powershell
npm install
npm run prisma:generate
npx prisma migrate deploy
```

4. Suba a aplicação uma vez para inicialização básica do sistema e seed das categorias, já que a carga de valores por categoria depende disso:

```powershell
npm run dev
```

Quando a aplicação subir, interrompa o processo. Se estiver usando Docker em homologação, o equivalente é subir `app` e `db` uma vez antes da etapa de pós-carga.

## Ordem exata de execução

### 1. Carga de clientes

```powershell
npm run import:legacy:clients:strict -- .\bdtec3.sql
```

Conferência imediata:

```sql
SELECT COUNT(*) AS total_clientes FROM clients;
```

Critério para seguir:

1. `Ignorados` deve ser zero.
2. Qualquer cliente ignorado interrompe a carga no modo estrito.

### 2. Carga base de propostas

Essa etapa importa diretamente a tabela `Proposta` do dump legado para o PostgreSQL.

Primeiro em leitura:

```powershell
npm run import:legacy:proposals:strict -- --dry-run .\bdtec3.sql
```

Depois aplicando:

```powershell
npm run import:legacy:proposals:strict -- .\bdtec3.sql
```

Conferências imediatas:

```sql
SELECT COUNT(*) AS total_propostas FROM proposals;

SELECT COUNT(DISTINCT code) AS total_codigos_distintos FROM proposals;

SELECT COUNT(*) AS propostas_cliente_fallback
FROM proposals
WHERE client_id = '00000000-0000-0000-0000-000000000001';
```

Critério para seguir:

1. Todos os contadores `skipped*` no resumo do script devem ser zero.
2. `total_propostas` deve ficar compatível com o dump legado importado.
3. `propostas_cliente_fallback` deve continuar zero, porque o fluxo direto não depende mais de cliente fallback.

### 3. Pós-carga de propostas

```powershell
npm run import:legacy:proposals:postload -- .\bdtec3.sql
```

Essa etapa executa, em ordem:

1. normalização de revisão;
2. vínculo de coordenadores;
3. vínculo de campos legados principais;
4. vínculo de campos legados restantes;
5. importação de aditivos e despesas;
6. importação de valores por categoria.

Conferências imediatas:

```sql
SELECT COUNT(*) AS total_aditivos FROM proposal_additives;

SELECT COUNT(*) AS total_despesas FROM proposal_expenses;

SELECT COUNT(*) AS total_valores_categoria FROM proposal_category_values;

SELECT COUNT(*) AS propostas_sem_campos_legados
FROM proposals
WHERE main_type IS NULL
  AND expectation IS NULL
  AND due_date IS NULL;

SELECT COUNT(*) AS valores_categoria_sem_mapeamento
FROM proposal_category_values
WHERE category_id IS NULL
  AND custom_name IS NOT NULL;
```

Critério para seguir:

1. `Aditivos ignorados` e `Despesas ignoradas` precisam ser zero ou justificados.
2. `Registros ignorados (proposta não encontrada)` na carga de categoria precisa ser zero ou justificado.
3. `valores_categoria_sem_mapeamento` precisa ser auditado, porque indica categoria não conciliada com o cadastro novo.

### 4. Dry-run de projetos

```powershell
npm run import:legacy:projects -- --dry-run .\bdtec3.sql
```

Critério para seguir:

1. `skippedMissingProposal` deve ser zero.
2. `skippedMissingClient` deve ser zero.
3. `skippedMissingCodeOrName` deve ser pontual e explicável.

### 5. Carga de projetos

```powershell
npm run import:legacy:projects -- .\bdtec3.sql
```

Conferências imediatas:

```sql
SELECT COUNT(*) AS total_projetos FROM projects;

SELECT COUNT(*) AS projetos_sem_proposta_legada
FROM projects
WHERE legacy_proposal_code IS NULL;

SELECT COUNT(*) AS projetos_sem_cliente
FROM projects
WHERE client_id IS NULL;
```

Critério para seguir:

1. `projetos_sem_proposta_legada` deve ser zero.
2. `projetos_sem_cliente` deve ser zero.

### 6. Vínculo de coordenadores dos projetos

Primeiro em leitura:

```powershell
npm run link:project:coordinators -- --dry-run
```

Depois aplicando:

```powershell
npm run link:project:coordinators
```

Conferência imediata:

```sql
SELECT COUNT(*) AS projetos_sem_coordenador
FROM projects
WHERE coordinator_id IS NULL;
```

Critério para seguir:

1. Se houver muitos projetos sem coordenador e isso for requisito de negócio, parar aqui e resolver.

### 7. Dry-run de horas e orçamento

```powershell
npm run import:legacy:project-hours -- --dry-run .\bdtec3.sql
```

Critério para seguir:

1. `skippedEntryMissingProject` deve ser zero.
2. `skippedEntryMissingRequired` deve ser zero ou muito baixo e auditado.
3. `entriesOver24Hours` deve ser auditado, mas não implica descarte automático.
4. `splitEntryRows` deve ser reconciliado com os lançamentos acima do limite físico do campo `hours` no sistema novo.

### 8. Carga de horas e orçamento

```powershell
npm run import:legacy:project-hours -- .\bdtec3.sql
```

Conferências imediatas:

```sql
SELECT COUNT(*) AS total_lancamentos FROM time_entries;

SELECT COUNT(*) AS projetos_com_budget
FROM projects
WHERE budget_hours > 0;

SELECT COUNT(*) AS lancamentos_sem_usuario_colaborador
FROM time_entries
WHERE collaborator_id IS NULL
   OR collaborator_id = '';
```

Critério para seguir:

1. `lancamentosInseridos + skipped*` deve reconciliar com o resumo impresso pelo script.
2. Nenhum lançamento deve ficar sem colaborador.

### 9. Vínculo de usuários dos lançamentos

Primeiro sem criação automática:

```powershell
npm run link:time-entries:users -- --dry-run --no-create-users
```

Se houver logins não resolvidos, o script gera um template CSV. Preencha esse arquivo com o usuário correto do sistema novo.

Aplicação estrita, sem usuário sintético:

```powershell
npm run link:time-entries:users -- --mapping-file=scripts/legacy-time-entry-user-mapping.template.csv --no-create-users
```

Conferências imediatas:

```sql
SELECT COUNT(*) AS lancamentos_colaborador_sem_usuario
FROM time_entries t
LEFT JOIN users u ON u.id = t.collaborator_id
WHERE u.id IS NULL;

SELECT COUNT(*) AS lancamentos_aprovador_sem_usuario
FROM time_entries t
LEFT JOIN users u ON u.id = t.approved_by_id
WHERE t.approved_by_id IS NOT NULL
  AND u.id IS NULL;
```

Critério para seguir:

1. Os dois contadores devem ser zero.
2. Se não houver mapeamento manual suficiente, a criação automática de usuários legados só é aceitável quando `unresolvedLegacyLogins = 0` e os nomes forem normalizados no backfill final.

### 10. Backfills finais

```powershell
npm run backfill:proposal:project-links
npm run backfill:legacy:user-names
```

Conferências imediatas:

```sql
SELECT COUNT(*) AS propostas_com_project_id
FROM proposals
WHERE project_id IS NOT NULL;

SELECT COUNT(*) AS usuarios_com_nome_vazio
FROM users
WHERE TRIM(name) = '';
```

## Reconciliação final mínima

Execute estas consultas ao final da homologação:

```sql
SELECT COUNT(*) AS total_clientes FROM clients;
SELECT COUNT(*) AS total_propostas FROM proposals;
SELECT COUNT(*) AS total_projetos FROM projects;
SELECT COUNT(*) AS total_lancamentos FROM time_entries;
SELECT COUNT(*) AS total_aditivos FROM proposal_additives;
SELECT COUNT(*) AS total_despesas FROM proposal_expenses;
SELECT COUNT(*) AS total_valores_categoria FROM proposal_category_values;
```

```sql
SELECT COUNT(*) AS propostas_cliente_fallback
FROM proposals
WHERE client_id = '00000000-0000-0000-0000-000000000001';

SELECT COUNT(*) AS projetos_sem_cliente
FROM projects
WHERE client_id IS NULL;

SELECT COUNT(*) AS projetos_sem_proposta_legada
FROM projects
WHERE legacy_proposal_code IS NULL;

SELECT COUNT(*) AS lancamentos_sem_projeto
FROM time_entries
WHERE project_id IS NULL;

SELECT COUNT(*) AS valores_categoria_sem_mapeamento
FROM proposal_category_values
WHERE category_id IS NULL
  AND custom_name IS NOT NULL;
```

## Resultado validado em homologação

Execução validada em 2026-05-15 sobre o dump `C:\Users\jefer\Downloads\bdtec3 (1).sql`.

Totais consolidados:

```text
clients: 260
proposals: 2525
proposal_additives: 139
proposal_expenses: 412
proposal_category_values: 9831
proposal_categories: 41
projects: 1089
time_entries: 43848
legacy_users_created: 67
orphan_time_entry_users: 0
orphan_time_entry_projects: 0
projects_with_zero_budget_and_time_entries: 100
```

Resultado operacional do bloco de horas:

```text
projetosComBudgetAtualizado: 753
timeRowsBrutas: 29658
lancamentosInseridos: 29848
skippedBudgetMissingProject: 0
skippedEntryMissingProject: 0
skippedEntryMissingRequired: 0
entriesOver24Hours: 1640
splitEntryRows: 190
```

Resultado operacional do vínculo de usuários dos lançamentos:

```text
totalDistinctLegacyLogins: 65
matchedByEmailPrefix: 24
createdUsers: 41
unresolvedLegacyLogins: 0
collaboratorRowsToUpdate: 43848
approverRowsToUpdate: 0
legacyUsersInDump: 77
updatedFullNames: 67
```

Ponto de atenção remanescente:

1. `projects_with_zero_budget_and_time_entries = 100` precisa de auditoria funcional do negócio antes de promover a mesma base para produção.

## Critério de aprovação da homologação

Avance para produção apenas se:

1. não houver skips sem explicação formal;
2. não houver usuário legado não conciliado;
3. não houver proposta relevante presa em cliente fallback;
4. não houver categoria pendente de mapeamento;
5. os totais finais forem aceitos pela validação funcional do negócio.

## Comando-resumo

Se tudo estiver validado, a sequência operacional fica:

```powershell
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run import:legacy:clients -- .\bdtec3.sql
npm run import:legacy:proposals -- --dry-run .\bdtec3.sql
npm run import:legacy:proposals -- .\bdtec3.sql
npm run import:legacy:proposals:postload -- .\bdtec3.sql
npm run import:legacy:projects -- --dry-run .\bdtec3.sql
npm run import:legacy:projects -- .\bdtec3.sql
npm run link:project:coordinators -- --dry-run
npm run link:project:coordinators
npm run import:legacy:project-hours -- --dry-run .\bdtec3.sql
npm run import:legacy:project-hours -- .\bdtec3.sql
npm run link:time-entries:users -- --dry-run --no-create-users
npm run link:time-entries:users -- --mapping-file=scripts/legacy-time-entry-user-mapping.template.csv --no-create-users
npm run backfill:proposal:project-links
npm run backfill:legacy:user-names
```