/**
 * Total da proposta e reflexo dele no orçamento do projeto.
 *
 * A regra de negócio, confirmada com o cliente:
 *
 *   total da proposta  = Σ(preço-hora × horas) das categorias + mobilização − desconto
 *   orçamento do projeto = total da proposta que gerou o projeto pelo TAP
 *                          + total de cada aditivo vinculado
 *
 * O aditivo SOMA, não substitui: um projeto de R$ 2,4 milhões que recebe um
 * aditivo de R$ 287 mil vale R$ 2,69 milhões, e tratar o aditivo como se fosse a
 * proposta de origem apagaria o contrato original.
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
      totalValue: true, estimatedHours: true, tapGeneratedAt: true,
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
  const { base, aditivos } = await resolveProjectProposals(projectId);
  if (!base) return null;

  const budgetValue =
    Number(base.totalValue ?? 0) + aditivos.reduce((s, a) => s + Number(a.totalValue ?? 0), 0);
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
