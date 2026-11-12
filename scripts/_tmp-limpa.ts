import 'dotenv/config';
import { prisma } from '../server/db.ts';

const BASE = 'http://localhost:5000';
const r = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' }),
});
const token = ((await r.json()) as any).accessToken as string;

const prop = await prisma.proposal.findFirst({ where: { code: 'P26235' }, select: { id: true, projectId: true } });
const linha = await prisma.proposalAdditive.findFirst({
  where: { proposalId: prop!.id, subcontractValue: 999 },
  select: { id: true },
});
if (!linha) { console.log('linha de teste nao encontrada'); process.exit(1); }

const del = await fetch(`${BASE}/api/proposals/${prop!.id}/additives/${linha.id}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
});
console.log('remocao via API: HTTP ' + del.status);

const fim = await prisma.project.findUnique({ where: { id: prop!.projectId! }, select: { budgetValue: true, endDate: true } });
console.log(`orcamento apos remocao: R$ ${Number(fim!.budgetValue)} (esperado 10995.91)`);
console.log(`termino apos remocao: ${fim!.endDate?.toISOString().slice(0, 10)} (esperado 2026-11-06 = inicio + prazo base)`);
const okTudo = Math.abs(Number(fim!.budgetValue) - 10995.91) < 0.01 && fim!.endDate?.toISOString().slice(0, 10) === '2026-11-06';
console.log(okTudo ? 'REVERSAO COMPLETA: gancho de remocao OK' : 'ALGO DIVERGENTE');
await prisma.$disconnect();
process.exit(okTudo ? 0 : 1);
