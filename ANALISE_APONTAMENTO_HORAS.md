# Análise e correções — Módulo de Apontamento de Horas

Data: 2026-08-20/21
Escopo revisado: [client/src/pages/TimeEntries.tsx](client/src/pages/TimeEntries.tsx), [client/src/pages/TimeApprovals.tsx](client/src/pages/TimeApprovals.tsx), [server/routes.ts](server/routes.ts), [server/storage.ts](server/storage.ts), [prisma/schema.prisma](prisma/schema.prisma).

Todos os 17 pontos abaixo foram identificados na revisão e implementados/corrigidos.

## Bugs / erros funcionais

1. **Impossível lançar horas de um dia diferente de "hoje".**
   Corrigido: adicionado seletor de data (Popover + Calendar) no modal de apontamento, permitindo escolher qualquer data passada (datas futuras continuam bloqueadas).

2. **Cálculo do limite diário estava incorreto (cross-project).**
   `getTimeEntriesByCollaboratorAndDate` somava horas do colaborador em **todos os projetos** no dia, mas comparava com o limite de **um único** projeto.
   Corrigido: a função agora aceita um `projectId` opcional e o backend passa a escopar a soma por colaborador + projeto.

3. **Cards "Período/Aprovadas/Pendentes" mostravam dados de toda a equipe.**
   `timeEntries` do projeto não eram filtradas pelo usuário logado.
   Corrigido: novo componente `ProjectEntriesPanel` filtra por `entry.collaboratorId === user.id` antes de calcular os totais exibidos.

4. **Sem validação de horas no backend.**
   Corrigido: `POST /api/projects/time-entries` e o novo `PUT` agora validam `0 < horas <= 24` no servidor, independente do `<input>` do frontend.

5. **Sem endpoint de edição ou exclusão de lançamento.**
   Corrigido: adicionados `PUT /api/projects/time-entries/:id` e `DELETE /api/projects/time-entries/:id`, restritos ao próprio colaborador e apenas enquanto o status for `pending`.

6. **Nenhuma lista de lançamentos individuais na tela de apontamento.**
   Corrigido: seção "Meus lançamentos" adicionada dentro de cada card de projeto expandido, com data, horas, status, motivo de rejeição (quando houver) e ações de editar/excluir para pendentes.

7. **Sem notificação ao aprovar/rejeitar um lançamento.**
   Corrigido: `PATCH .../status` agora chama `storage.createNotification` com os novos tipos `time_entry_approved` / `time_entry_rejected`, incluindo o motivo da rejeição na mensagem.

## Backend / consistência

8. **Fallback silencioso na checagem de alocação (`project_members`).**
   Corrigido: mantido o fallback permissivo (para não travar o lançamento em caso de tabela ausente), mas agora com `console.warn` registrando a ocorrência.

9. **Auto-aprovação com `approvedById` = o próprio colaborador.**
   Corrigido: quando o projeto não exige aprovação, `approvedById` passa a ser `null` em vez do id de quem lançou.

10. **Rejeição via `window.prompt` nativo.**
    Corrigido: substituído por um `Dialog` com `Textarea` dedicado (individual e em lote), em [TimeApprovals.tsx](client/src/pages/TimeApprovals.tsx).

## Usabilidade / UX

11. **Badge "X pendente(s)" mostrando literalmente "..." antes de expandir.**
    Corrigido: agora mostra "–" quando a contagem real ainda não foi carregada (em vez de um valor que parecia um dado real).

12. **Sem busca/filtro de projeto na tela de lançamento.**
    Corrigido: adicionado campo de busca por código/nome acima da lista de projetos.

13. **Sem indicação do limite diário do projeto antes de tentar salvar.**
    Corrigido: texto de apoio abaixo do seletor de data, mostrando o limite diário configurado no projeto.

14. **Rejeição sem opção de corrigir e reenviar.**
    Corrigido: como consequência do item 5, um lançamento pendente pode ser editado e corrigido diretamente pelo colaborador antes de ser (re)avaliado.

## Higiene de código / organização

15. **Arquivo morto `client/src/pages/TimeEntries.OLD.tsx`.**
    Excluído (confirmado com o usuário) — não era importado em nenhum lugar.

16. **Implementação NestJS/TypeORM duplicada em `backend/`.**
    Documentada apenas — módulo não usado em produção (a API ativa é a de `server/`), mantido sem alterações por estar fora do escopo do apontamento de horas.

17. **`statusLabels` declarado e não utilizado.**
    Resolvido organicamente: com a nova seção "Meus lançamentos" (item 6), a constante passou a ser usada para exibir o status de cada lançamento.

## Arquivos alterados
- `server/routes.ts` — validações, novos endpoints PUT/DELETE, notificações, correção do limite diário, correção da auto-aprovação.
- `server/storage.ts` — assinatura de `getTimeEntriesByCollaboratorAndDate`, novos `NotificationType`.
- `client/src/lib/api.ts` — `updateTimeEntry`, `deleteTimeEntry`, novos `NotificationType`.
- `client/src/pages/TimeEntries.tsx` — reescrita da tela (data editável, lista "Meus lançamentos", busca, editar/excluir, dica de limite diário).
- `client/src/pages/TimeApprovals.tsx` — diálogo de rejeição, correção do badge de pendências.
- `client/src/pages/TimeEntries.OLD.tsx` — removido.

---

# Análise e correções — Módulo Comercial (Propostas)

Data: 2026-08-21
Escopo revisado: [client/src/pages/Proposals.tsx](client/src/pages/Proposals.tsx), [client/src/lib/api.ts](client/src/lib/api.ts), [server/routes.ts](server/routes.ts), [server/storage.ts](server/storage.ts), [prisma/schema.prisma](prisma/schema.prisma).

Revisão completa realizada; dos itens levantados, os 4 bugs funcionais abaixo foram corrigidos nesta etapa. Os demais pontos (performance, segurança, duplicação/higiene) ficam listados como pendentes para decisão futura.

## Bugs corrigidos

1. **Valores negativos aceitos em despesas e aditivos.**
   `POST`/`PUT` de `/api/proposals/:proposalId/expenses` e `/api/proposals/:proposalId/additives` só validavam `Number.isFinite`, sem checar `>= 0`.
   Corrigido: agora rejeitam `value < 0` (despesas) e `subcontractValue`/`mobilizationValue`/`readjustValue < 0` (aditivos), em criação e edição.

2. **Fluxo morto: `POST /api/proposals/convert`.**
   Rota backend, `proposalsApi.convert` e a `convertMutation` em `Proposals.tsx` nunca eram chamados — superados pelo fluxo de TAP (`/tap/generate`).
   Corrigido: removidos rota, wrapper de API e mutation órfã.

3. **Colunas de ordenação mortas (`approvalDate`, `probability`).**
   Referenciadas no switch de ordenação da lista, mas nenhum dos dois campos existe no schema Prisma nem em definição de coluna — `case`s inalcançáveis.
   Corrigido: removidos do switch de ordenação em `Proposals.tsx`.

4. **Sem validação de datas logicamente inconsistentes.**
   Não havia checagem entre `expectedStartDate`/`expectedEndDate` nem `sentDate`/`dueDate`.
   Corrigido: nova função `validateProposalDateOrdering` em `server/routes.ts`, aplicada tanto no `POST /api/proposals` quanto no `PUT /api/proposals/:id` (considerando os valores já existentes quando o campo não é enviado na edição).

## Pontos identificados e ainda NÃO corrigidos (pendentes de decisão)

- **Performance:** `GET /api/proposals` retorna todas as ~2700 propostas sem paginação no servidor, e recarrega toda a tabela de usuários a cada chamada para montar o mapa de apelidos de coordenador.
- **Segurança/permissão:** qualquer usuário com role `commercial` pode editar/excluir qualquer proposta, sem checagem de autoria/coordenador; `TEMP_FORCE_ALL_USERS_AS_ADMIN = true` continua ativo.
- **Duplicação:** `formData` vs `editFormData` em `Proposals.tsx` são states e validações quase idênticos, poderiam ser unificados.
- **Higiene:** campos legados nunca usados na UI (`utility`, `sentByName`, `specialist`, `rehabilitation`, `paymentBook`, `workOrders`, etc.); uso de `any` em pontos sensíveis de ordenação/filtro; `Proposals.tsx` com ~5800 linhas em um único arquivo.

## Arquivos alterados
- `server/routes.ts` — validações de valores não-negativos em despesas/aditivos, remoção da rota `/proposals/convert`, nova função `validateProposalDateOrdering` aplicada em criação e edição de proposta.
- `client/src/lib/api.ts` — remoção do método `convert` de `proposalsApi`.
- `client/src/pages/Proposals.tsx` — remoção da `convertMutation` órfã e dos `case`s de ordenação mortos (`approvalDate`, `probability`).

