import 'dotenv/config';
import { prisma } from '../server/db.ts';

const BASE = 'http://localhost:5000';
let falhas = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  OK    ' : '  FALHA ') + m); if (!c) falhas++; };
const r = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' }),
});
const token = ((await r.json()) as any).accessToken as string;

// proposta convertida pequena, com prazo e projeto com inicio plausivel
const prop = await prisma.proposal.findFirst({
  where: { code: 'P26235', projectId: { not: null } },
  select: { id: true, code: true, termMonths: true, projectId: true },
});
if (!prop) throw new Error('P26235 nao encontrada/convertida');
const antes = await prisma.project.findUnique({
  where: { id: prop.projectId! },
  select: { code: true, budgetValue: true, endDate: true, startDate: true },
});
console.log(`cenario: ${prop.code} (prazo base ${prop.termMonths ?? '-'} meses) -> projeto ${antes!.code}`);
console.log(`  antes: orcamento R$ ${Number(antes!.budgetValue)} | inicio ${antes!.startDate?.toISOString().slice(0,10)} | termino ${antes!.endDate?.toISOString().slice(0,10) ?? '-'}`);

// cria linha de aditivo: +R$100 mobilizacao, +R$50 reajuste, +2 meses
const cria = await fetch(`${BASE}/api/proposals/${prop.id}/additives`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ termMonths: 2, subcontractValue: 999, mobilizationValue: 100, readjustValue: 50 }),
});
const criado: any = await cria.json();
ok(cria.status === 200 || cria.status === 201, `linha de aditivo criada: HTTP ${cria.status}`);

const depois = await prisma.project.findUnique({ where: { id: prop.projectId! }, select: { budgetValue: true, endDate: true } });
const deltaEsperado = 150; // mobilizacao + reajuste (subcontratacao fica fora)
ok(Math.abs(Number(depois!.budgetValue) - Number(antes!.budgetValue) - deltaEsperado) < 0.01,
   `orcamento somou mob+reajuste (nao subcontratacao): ${Number(antes!.budgetValue)} -> ${Number(depois!.budgetValue)}`);
ok(Boolean(depois!.endDate), `termino definido: ${depois!.endDate?.toISOString().slice(0,10)} (inicio + prazo base + 2 meses do aditivo)`);

// remove a linha: recomputo deterministico deve reverter o orcamento
const del = await fetch(`${BASE}/api/proposals/${prop.id}/additives/${criado.id}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
});
ok(del.status === 200 || del.status === 204, `linha removida: HTTP ${del.status}`);
const fim = await prisma.project.findUnique({ where: { id: prop.projectId! }, select: { budgetValue: true, endDate: true } });
ok(Math.abs(Number(fim!.budgetValue) - Number(antes!.budgetValue)) < 0.01,
   `orcamento reverteu: R$ ${Number(fim!.budgetValue)}`);
console.log(`  termino apos remocao: ${fim!.endDate?.toISOString().slice(0,10)} (= inicio + prazo base, sem o aditivo)`);

console.log(falhas === 0 ? '\nGancho do aditivo funcionando.' : `\n${falhas} falha(s).`);
await prisma.$disconnect();
process.exit(falhas ? 1 : 0);
