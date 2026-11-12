/**
 * Total da proposta e reflexo dele no orçamento do projeto.
 *
 * A regra de negócio, confirmada com o cliente:
 *
 *   total da proposta  = Σ(preço-hora × horas) das categorias + mobilização − desconto
 *   orçamento do projeto = total da proposta que gerou o projeto pelo TAP
 *                          + total de cada proposta aditiva vinculada
 *                          + mobilização e reajuste das LINHAS de aditivo
 *                            (subcontratação fica fora, como na proposta base)
 *   término do projeto = início + prazo da base + Σ(prazos dos aditivos)
 *
 * O aditivo SOMA, não substitui: um projeto de R$ 2,4 milhões que recebe um
 * aditivo de R$ 287 mil vale R$ 2,69 milhões, e tratar o aditivo como se fosse a
 * proposta de origem apagaria o contrato original. Decisão do cliente em
 * 12/11/2026: o aditivo lançado na telinha da proposta também soma no projeto
 * e estende o término. As categorias com idAditivo do legado já vêm somadas no
 * total da proposta (o reparo não as filtra), então aqui entram só os campos
 * próprios da linha.
 */
import { prisma } from './db.ts';

export interface ProposalTotals {
  totalValue: number;
  estimatedHours: number;
}

/** Recalcula e grava o total de uma proposta a partir das suas categorias. */
export async function recomputeProposalTotals(proposalId: string): Promise<ProposalTotals | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, projectId: true, mobilizationValue: true, discountValue: true },
  });
  if (!proposal) return null;

  const linhas = await prisma.proposalCategoryValue.findMany({
    where: { proposalId },
    select: { value: true, hours: true },
  });

  const maoDeObra = linhas.reduce((soma, l) => soma + Number(l.value ?? 0) * Number(l.hours ?? 0), 0);
  const horas = linhas.reduce((soma, l) => soma + Number(l.hours ?? 0), 0);

  const totalValue = Math.max(
    0,
    maoDeObra + Number(proposal.mobilizationValue ?? 0) - Number(proposal.discountValue ?? 0)
  );
  const estimatedHours = Math.round(horas);

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { totalValue: Number(totalValue.toFixed(2)), estimatedHours },
  });

  return { totalValue, estimatedHours };
}

/**
 * Qual proposta originou o projeto e quais são seus aditivos.
 *
 * Um projeto pode ter várias linhas de proposta apontando para ele: revisões do
 * mesmo código e aditivos. A de origem é a que NÃO é aditivo — entre as revisões,
 * preferimos a que efetivamente gerou o TAP.
 */
export async function resolveProjectProposals(projectId: string) {
  const vinculadas = await prisma.proposal.findMany({
    where: { projectId },
    select: {
      id: true, code: true, revision: true, status: true,
      totalValue: true, estimatedHours: true, tapGeneratedAt: true, termMonths: true,
    },
    orderBy: [{ revision: 'desc' }],
  });

  const aditivos = vinculadas.filter((p) => p.status === 'sucesso_aditivo');
  const candidatasBase = vinculadas.filter((p) => p.status !== 'sucesso_aditivo');

  const base =
    candidatasBase.find((p) => p.tapGeneratedAt) ??
    candidatasBase[0] ??
    null;

  return { base, aditivos, vinculadas };
}

/**
 * Recalcula o orçamento do projeto a partir das propostas vinculadas.
 *
 * Devolve null quando não há proposta de origem: nesses casos o orçamento veio de
 * outro lugar (import do legado, cadastro manual) e sobrescrevê-lo com zero
 * destruiria o dado em vez de corrigi-lo.
 */
export async function syncProjectBudgetFromProposals(
  projectId: string,
  options: { dryRun?: boolean } = {}
): Promise<{ budgetValue: number; budgetHours: number; baseCode: string; additives: number } | null> {
  const { base, aditivos, vinculadas } = await resolveProjectProposals(projectId);
  if (!base) return null;

  // Linhas de aditivo (a telinha da proposta): mobilização e reajuste somam;
  // subcontratação não, pelo mesmo critério do total da proposta base.
  const linhasAditivo = await prisma.proposalAdditive.findMany({
    where: { proposalId: { in: vinculadas.map((p) => p.id) } },
    select: { mobilizationValue: true, readjustValue: true },
  });
  const extrasDasLinhas = linhasAditivo.reduce(
    (s, l) => s + Number(l.mobilizationValue ?? 0) + Number(l.readjustValue ?? 0),
    0
  );

  const budgetValue =
    Number(base.totalValue ?? 0) +
    aditivos.reduce((s, a) => s + Number(a.totalValue ?? 0), 0) +
    extrasDasLinhas;
  const budgetHours =
    Number(base.estimatedHours ?? 0) + aditivos.reduce((s, a) => s + Number(a.estimatedHours ?? 0), 0);

  if (!options.dryRun) {
    await prisma.project.update({
      where: { id: projectId },
      data: { budgetValue: Number(budgetValue.toFixed(2)), budgetHours: Math.round(budgetHours) },
    });
  }

  return {
    budgetValue: Number(budgetValue.toFixed(2)),
    budgetHours: Math.round(budgetHours),
    baseCode: `${base.code} rev${base.revision}`,
    additives: aditivos.length,
  };
}

const MIN_DATA_PLAUSIVEL = new Date('1990-01-01').getTime();

/** Início + meses com fração: parte inteira no calendário, fração em dias (0,5 = 15). */
function somaMesesComFracao(inicio: Date, meses: number): Date {
  const base = new Date(inicio.getTime());
  const inteiros = Math.trunc(meses);
  const fracao = meses - inteiros;
  base.setUTCMonth(base.getUTCMonth() + inteiros);
  if (fracao > 0) base.setUTCDate(base.getUTCDate() + Math.round(fracao * 30));
  return base;
}

/**
 * Término do projeto a partir do prazo contratual: prazo da proposta base
 * + prazos das propostas aditivas + prazos das linhas de aditivo.
 *
 * Só recalcula quando há prazo contratual (> 0) e início plausível; sem isso,
 * devolve null e o término existente fica como está (pode ter sido definido à
 * mão). É chamado nos eventos de aditivo — é o aditivo que muda o prazo.
 */
export async function syncProjectEndDateFromTerms(
  projectId: string,
  options: { dryRun?: boolean } = {}
): Promise<{ endDate: Date; termMonths: number } | null> {
  const { base, aditivos, vinculadas } = await resolveProjectProposals(projectId);
  if (!base) return null;

  const linhas = await prisma.proposalAdditive.findMany({
    where: { proposalId: { in: vinculadas.map((p) => p.id) } },
    select: { termMonths: true },
  });

  const prazoTotal =
    Number(base.termMonths ?? 0) +
    aditivos.reduce((s, a) => s + Number(a.termMonths ?? 0), 0) +
    linhas.reduce((s, l) => s + Number(l.termMonths ?? 0), 0);
  if (!(prazoTotal > 0)) return null;

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { startDate: true },
  });
  const inicio = projeto?.startDate;
  if (!inicio || inicio.getTime() <= MIN_DATA_PLAUSIVEL) return null;

  const endDate = somaMesesComFracao(inicio, prazoTotal);
  if (!options.dryRun) {
    await prisma.project.update({ where: { id: projectId }, data: { endDate } });
  }
  return { endDate, termMonths: prazoTotal };
}

/** Recalcula a proposta e propaga para o projeto dela, se houver. */
export async function recomputeProposalAndProject(proposalId: string): Promise<void> {
  await recomputeProposalTotals(proposalId);

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { projectId: true },
  });
  if (proposal?.projectId) {
    await syncProjectBudgetFromProposals(proposal.projectId);
  }
}

/**
 * Propaga um evento de ADITIVO para o projeto: orçamento e término. Chamado
 * pelos endpoints de criação/edição/remoção de linha de aditivo e pela
 * vinculação de proposta aditiva via TAP.
 */
export async function syncProjectFromAdditiveChange(proposalId: string): Promise<void> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { projectId: true },
  });
  if (!proposal?.projectId) return;

  await syncProjectBudgetFromProposals(proposal.projectId);
  await syncProjectEndDateFromTerms(proposal.projectId);
}
