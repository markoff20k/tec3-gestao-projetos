/**
 * Aditivo por categoria: regras confirmadas com o cliente em 18/11/2026.
 *
 *   - Uma linha de aditivo ajusta as horas de UMA categoria, para mais ou para
 *     menos. Pode incluir categoria nova e pode zerar uma categoria existente.
 *   - Valor da linha = horas × preço-hora. O preço-hora vem da proposta base
 *     por padrão, mas pode ser alterado na linha.
 *   - Redução trava no já apontado: o contratado da categoria (base + aditivos)
 *     nunca fica abaixo das horas lançadas no projeto por profissionais daquela
 *     categoria. Sem apontamento, pode zerar.
 *   - O valor total do projeto nunca fica negativo.
 *
 * A ligação hora-lançada → categoria é a categoria cadastrada HOJE no perfil
 * de quem lançou (não existe categoria no apontamento). O mini-relatório expõe
 * esse agrupamento por profissional justamente para a pessoa enxergar de onde
 * vem o número antes de confirmar a redução.
 */
import { prisma } from './db.ts';
import { resolveProjectProposals, syncProjectBudgetFromProposals } from './proposalTotals.ts';

export interface AdditiveCategoryLineInput {
  categoryId: string | null;
  customName: string | null;
  hoursDelta: number;
  hourlyValue: number;
}

export interface CategoryBalanceProfessional {
  userId: string;
  name: string;
  hours: number;
}

export interface CategoryBalanceRow {
  key: string;
  categoryId: string | null;
  name: string;
  hourlyValue: number;
  baseHours: number;
  additiveHours: number;
  contractedHours: number;
  loggedHours: number;
  availableHours: number;
  professionals: CategoryBalanceProfessional[];
}

export interface CategoryBalance {
  projectId: string | null;
  rows: CategoryBalanceRow[];
  uncategorized: { hours: number; professionals: CategoryBalanceProfessional[] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function lineValue(line: { hoursDelta: unknown; hourlyValue: unknown }): number {
  return round2(Number(line.hoursDelta ?? 0) * Number(line.hourlyValue ?? 0));
}

export function categoryKey(categoryId: string | null | undefined, customName: string | null | undefined): string {
  if (categoryId) return `id:${categoryId}`;
  return `custom:${String(customName ?? '').trim().toLocaleLowerCase('pt-BR')}`;
}

export function normalizeCategoryLines(raw: unknown): { lines: AdditiveCategoryLineInput[]; error: string | null } {
  if (raw === undefined || raw === null) return { lines: [], error: null };
  if (!Array.isArray(raw)) return { lines: [], error: 'Linhas de categoria inválidas' };

  const lines: AdditiveCategoryLineInput[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const categoryId = typeof item?.categoryId === 'string' && item.categoryId.trim() ? item.categoryId.trim() : null;
    const customName = typeof item?.customName === 'string' && item.customName.trim() ? item.customName.trim() : null;
    if (!categoryId && !customName) return { lines: [], error: 'Informe a categoria de cada linha do aditivo' };

    const hoursDelta = round2(Number(item?.hoursDelta));
    const hourlyValue = round2(Number(item?.hourlyValue));
    if (!Number.isFinite(hoursDelta) || hoursDelta === 0) {
      return { lines: [], error: 'Informe as horas (positivas ou negativas) de cada categoria' };
    }
    if (!Number.isFinite(hourlyValue) || hourlyValue < 0) {
      return { lines: [], error: 'Preço-hora inválido' };
    }

    const key = categoryKey(categoryId, customName);
    if (seen.has(key)) return { lines: [], error: 'Categoria repetida no mesmo aditivo' };
    seen.add(key);

    lines.push({ categoryId, customName, hoursDelta, hourlyValue });
  }
  return { lines, error: null };
}

/**
 * Conjunto de propostas que compõem o contrato: se a proposta virou projeto,
 * todas as vinculadas a ele (base + propostas aditivas); senão, só ela mesma.
 */
async function resolveContractProposals(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, projectId: true, status: true },
  });
  if (!proposal) return null;

  if (proposal.projectId) {
    const { base, vinculadas } = await resolveProjectProposals(proposal.projectId);
    return {
      projectId: proposal.projectId,
      baseId: base?.id ?? proposal.id,
      proposalIds: vinculadas.length ? vinculadas.map((p) => p.id) : [proposal.id],
    };
  }
  return { projectId: null, baseId: proposal.id, proposalIds: [proposal.id] };
}

export async function getCategoryBalance(proposalId: string): Promise<CategoryBalance | null> {
  const contract = await resolveContractProposals(proposalId);
  if (!contract) return null;

  const rowsByKey = new Map<string, CategoryBalanceRow>();
  const ensureRow = (categoryId: string | null, customName: string | null): CategoryBalanceRow => {
    const key = categoryKey(categoryId, customName);
    let row = rowsByKey.get(key);
    if (!row) {
      row = {
        key,
        categoryId,
        name: customName ?? '',
        hourlyValue: 0,
        baseHours: 0,
        additiveHours: 0,
        contractedHours: 0,
        loggedHours: 0,
        availableHours: 0,
        professionals: [],
      };
      rowsByKey.set(key, row);
    }
    return row;
  };

  // Horas contratadas nas propostas (base e propostas aditivas). O preço-hora
  // de referência é o da proposta base; proposta aditiva só preenche se a
  // categoria não existia na base.
  const categoryValues = await prisma.proposalCategoryValue.findMany({
    where: { proposalId: { in: contract.proposalIds } },
    select: { proposalId: true, categoryId: true, customName: true, value: true, hours: true },
  });
  for (const cv of categoryValues) {
    const row = ensureRow(cv.categoryId ?? null, cv.customName ?? null);
    row.baseHours = round2(row.baseHours + Number(cv.hours ?? 0));
    const isBase = cv.proposalId === contract.baseId;
    if (isBase || row.hourlyValue === 0) row.hourlyValue = Number(cv.value ?? 0);
  }

  // Linhas de aditivo já registradas.
  const additiveLines = await prisma.proposalAdditiveCategoryLine.findMany({
    where: { additive: { proposalId: { in: contract.proposalIds } } },
    select: { categoryId: true, customName: true, hoursDelta: true, hourlyValue: true },
  });
  for (const line of additiveLines) {
    const row = ensureRow(line.categoryId ?? null, line.customName ?? null);
    row.additiveHours = round2(row.additiveHours + Number(line.hoursDelta ?? 0));
    if (row.hourlyValue === 0) row.hourlyValue = Number(line.hourlyValue ?? 0);
  }

  // Horas lançadas no projeto, agrupadas pela categoria atual de quem lançou.
  const uncategorized: CategoryBalance['uncategorized'] = { hours: 0, professionals: [] };
  if (contract.projectId) {
    const entries = await prisma.timeEntry.findMany({
      where: { projectId: contract.projectId, status: { not: 'rejected' } },
      select: { collaboratorId: true, hours: true },
    });
    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(e.collaboratorId, round2((hoursByUser.get(e.collaboratorId) ?? 0) + Number(e.hours ?? 0)));
    }
    const users = hoursByUser.size
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(hoursByUser.keys()) } },
          select: { id: true, name: true, professionalCategoryId: true },
        })
      : [];
    for (const u of users) {
      const hours = hoursByUser.get(u.id) ?? 0;
      if (hours <= 0) continue;
      const professional = { userId: u.id, name: u.name, hours };
      if (u.professionalCategoryId) {
        const row = ensureRow(u.professionalCategoryId, null);
        row.loggedHours = round2(row.loggedHours + hours);
        row.professionals.push(professional);
      } else {
        uncategorized.hours = round2(uncategorized.hours + hours);
        uncategorized.professionals.push(professional);
      }
    }
  }

  const categoryIds = Array.from(rowsByKey.values())
    .map((r) => r.categoryId)
    .filter((id): id is string => Boolean(id));
  const categories = categoryIds.length
    ? await prisma.proposalCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const rows = Array.from(rowsByKey.values()).map((row) => {
    if (row.categoryId) row.name = categoryNameById.get(row.categoryId) ?? row.name ?? row.categoryId;
    row.contractedHours = round2(row.baseHours + row.additiveHours);
    row.availableHours = round2(row.contractedHours - row.loggedHours);
    row.professionals.sort((a, b) => b.hours - a.hours);
    return row;
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return { projectId: contract.projectId, rows, uncategorized };
}

export interface AdditiveNextState {
  mobilizationValue: number;
  readjustValue: number;
  lines: AdditiveCategoryLineInput[];
}

/**
 * Valida criação (additiveId null), edição ou remoção (next null) de um aditivo
 * contra as duas travas: apontamento por categoria e valor do projeto.
 */
export async function validateAdditiveChange(params: {
  proposalId: string;
  additiveId: string | null;
  next: AdditiveNextState | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: params.proposalId },
    select: { projectId: true },
  });
  if (!proposal) return { ok: false, message: 'Proposta nao encontrada' };

  const previous = params.additiveId
    ? await prisma.proposalAdditive.findFirst({
        where: { id: params.additiveId, proposalId: params.proposalId },
        include: { categoryLines: true },
      })
    : null;

  const prevLines = (previous?.categoryLines ?? []).map((l) => ({
    key: categoryKey(l.categoryId, l.customName),
    hoursDelta: Number(l.hoursDelta ?? 0),
    value: lineValue(l),
  }));
  const nextLines = (params.next?.lines ?? []).map((l) => ({
    key: categoryKey(l.categoryId, l.customName),
    name: l.customName ?? null,
    categoryId: l.categoryId,
    hoursDelta: l.hoursDelta,
    value: lineValue(l),
  }));

  // Sem projeto não há apontamento nem orçamento a proteger.
  if (!proposal.projectId) return { ok: true };

  const balance = await getCategoryBalance(params.proposalId);
  const rowByKey = new Map((balance?.rows ?? []).map((r) => [r.key, r]));

  const deltaByKey = new Map<string, number>();
  for (const l of nextLines) deltaByKey.set(l.key, round2((deltaByKey.get(l.key) ?? 0) + l.hoursDelta));
  for (const l of prevLines) deltaByKey.set(l.key, round2((deltaByKey.get(l.key) ?? 0) - l.hoursDelta));

  for (const [key, delta] of Array.from(deltaByKey.entries())) {
    if (delta >= 0) continue;
    const row = rowByKey.get(key);
    const contracted = row?.contractedHours ?? 0;
    const logged = row?.loggedHours ?? 0;
    const after = round2(contracted + delta);
    const name = row?.name || nextLines.find((l) => l.key === key)?.name || 'categoria';
    if (after < 0) {
      return { ok: false, message: `${name}: redução maior que o contratado (${contracted.toLocaleString('pt-BR')}h).` };
    }
    if (after < logged) {
      const max = Math.max(0, round2(contracted - logged));
      return {
        ok: false,
        message: `${name}: já há ${logged.toLocaleString('pt-BR')}h apontadas no projeto; só é possível reduzir até ${max.toLocaleString('pt-BR')}h.`,
      };
    }
  }

  const current = await syncProjectBudgetFromProposals(proposal.projectId, { dryRun: true });
  if (!current) return { ok: true };

  const prevValue =
    Number(previous?.mobilizationValue ?? 0) +
    Number(previous?.readjustValue ?? 0) +
    prevLines.reduce((s, l) => s + l.value, 0);
  const nextValue = params.next
    ? params.next.mobilizationValue + params.next.readjustValue + nextLines.reduce((s, l) => s + l.value, 0)
    : 0;
  const prospective = round2(current.budgetValue - prevValue + nextValue);
  if (prospective < 0) {
    return {
      ok: false,
      message: `O valor do projeto ficaria negativo (${prospective.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`,
    };
  }

  return { ok: true };
}
