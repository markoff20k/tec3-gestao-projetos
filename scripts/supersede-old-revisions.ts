/**
 * Marca como "superada" as revisões antigas de proposta que ficaram em aberto
 * (Em elaboração / Em análise) depois que uma revisão mais nova foi criada.
 *
 * Reparo único para o histórico: desde 26/11/2026 createProposalRevision já faz
 * isso na hora. Só mexe em revisão em aberto — Sucesso e as perdas (Não sucesso,
 * Cancelada, Declínio) ficam como estão, por decisão do cliente.
 *
 * Uso:
 *   npx tsx scripts/supersede-old-revisions.ts            (só mostra)
 *   npx tsx scripts/supersede-old-revisions.ts --apply
 */
import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { OPEN_PROPOSAL_STATUSES, ProposalStatus } from '../server/storage.ts';

const APLICAR = process.argv.includes('--apply');

async function main() {
  const candidatas = await prisma.$queryRaw<Array<{ id: string; code: string; revision: number; status: string; max_rev: number }>>`
    WITH latest AS (SELECT code, MAX(revision) AS max_rev FROM proposals GROUP BY code)
    SELECT p.id, p.code, p.revision, p.status, l.max_rev
    FROM proposals p JOIN latest l ON l.code = p.code
    WHERE p.revision < l.max_rev
    ORDER BY p.code, p.revision`;

  const alvo = candidatas.filter((p) => OPEN_PROPOSAL_STATUSES.has(String(p.status).trim().toLowerCase()));
  const mantidas = candidatas.length - alvo.length;

  console.log(`${candidatas.length} revisões antigas; ${alvo.length} em aberto → superada; ${mantidas} mantidas (sucesso/perda).`);
  console.table(alvo.map((p) => ({ codigo: `${p.code}-R${p.revision}`, status: p.status, ultima: `R${p.max_rev}` })));

  if (!APLICAR) {
    console.log('Dry-run. Rode com --apply para gravar.');
    return;
  }

  const r = await prisma.proposal.updateMany({
    where: { id: { in: alvo.map((p) => p.id) } },
    data: { status: ProposalStatus.SUPERADA },
  });
  console.log(`${r.count} propostas atualizadas para '${ProposalStatus.SUPERADA}'.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
