/**
 * Deriva a data de término dos projetos a partir do prazo em meses do legado.
 *
 * As propostas trazem prazo (prazoEmMeses), não data de término — e o import
 * deixava endDate vazio (ou com a data-zero 1899 do Delphi). Sem término, a
 * saúde do projeto mostra "Sem data de término definida" e o atraso de prazo
 * nunca é calculado.
 *
 * Regra: endDate = startDate + prazo em meses (parte inteira no calendário,
 * fração em dias corridos: 0,5 mês = 15 dias). Projetos administrativos
 * (Férias, Feriados...) ficam de fora: são perpétuos, e o prazo de 1 mês
 * que trazem do legado é placeholder — término neles viraria atraso falso
 * na saúde. Só preenche quem NÃO tem
 * término plausível; nunca sobrescreve uma data definida por alguém. Projetos
 * encerrados/cancelados ficam como estão.
 *
 * Uso:
 *   npx tsx scripts/backfill-project-end-dates.ts            (simulação)
 *   npx tsx scripts/backfill-project-end-dates.ts --apply
 */
import 'dotenv/config';
import { prisma } from '../server/db.ts';

const APLICAR = process.argv.includes('--apply');
const MIN_PLAUSIVEL = new Date('1990-01-01').getTime();

function somaMesesComFracao(inicio: Date, meses: number): Date {
  const base = new Date(inicio.getTime());
  const inteiros = Math.trunc(meses);
  const fracao = meses - inteiros;
  base.setUTCMonth(base.getUTCMonth() + inteiros);
  if (fracao > 0) base.setUTCDate(base.getUTCDate() + Math.round(fracao * 30));
  return base;
}

async function main() {
  const projetos = await prisma.project.findMany({
    where: { status: { in: ['planning', 'active', 'in_progress', 'on_hold'] }, isAdministrative: false },
    select: {
      id: true,
      code: true,
      startDate: true,
      endDate: true,
      legacyTermMonths: true,
      legacyProposalCode: true,
    },
    orderBy: { code: 'asc' },
  });

  // Fallback: prazo da proposta vinculada, para projeto sem prazo legado próprio.
  const propostas = await prisma.proposal.findMany({
    where: { termMonths: { not: null } },
    select: { code: true, revision: true, termMonths: true },
    orderBy: [{ revision: 'desc' }],
  });
  const prazoPorProposta = new Map<string, number>();
  for (const p of propostas) {
    if (!prazoPorProposta.has(p.code)) prazoPorProposta.set(p.code, Number(p.termMonths));
  }

  let jaTem = 0;
  let semInicio = 0;
  let semPrazo = 0;
  let preenchidos = 0;
  const amostra: string[] = [];

  for (const p of projetos) {
    const fimOk = p.endDate && p.endDate.getTime() > MIN_PLAUSIVEL;
    if (fimOk) {
      jaTem++;
      continue;
    }

    const inicioOk = p.startDate && p.startDate.getTime() > MIN_PLAUSIVEL;
    if (!inicioOk) {
      semInicio++;
      continue;
    }

    const prazo = Number(p.legacyTermMonths) > 0
      ? Number(p.legacyTermMonths)
      : (p.legacyProposalCode ? prazoPorProposta.get(p.legacyProposalCode) ?? 0 : 0);
    if (!(prazo > 0)) {
      semPrazo++;
      continue;
    }

    const novoFim = somaMesesComFracao(p.startDate as Date, prazo);
    if (amostra.length < 12) {
      amostra.push(
        `${p.code}: início ${(p.startDate as Date).toISOString().slice(0, 10)} + ${prazo} mes(es) -> término ${novoFim.toISOString().slice(0, 10)}`
      );
    }
    if (APLICAR) {
      await prisma.project.update({ where: { id: p.id }, data: { endDate: novoFim } });
    }
    preenchidos++;
  }

  console.log(`projetos em andamento: ${projetos.length}`);
  console.log(`  já tinham término plausível: ${jaTem}`);
  console.log(`  sem data de início usável:   ${semInicio}`);
  console.log(`  sem prazo em meses:          ${semPrazo}`);
  console.log(`  término derivado do prazo:   ${preenchidos}`);
  console.log('\namostra:');
  for (const a of amostra) console.log('  ' + a);
  console.log(APLICAR ? '\nAplicado.' : '\nNada foi gravado. Rode com --apply para aplicar.');
}

main()
  .catch((erro) => {
    console.error('Falha:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
