/**
 * Funde usuários duplicados vindos de dois imports diferentes do legado.
 *
 * O legado foi importado duas vezes: uma a partir dos logins (e-mail curto, tipo
 * "rsantos@legacy.tec3.local"), que trouxe todo o histórico, e outra a partir da
 * lista de nomes (e-mail derivado do nome completo), que criou contas vazias. O
 * resultado são dois registros ativos com o mesmo nome, indistinguíveis nos
 * seletores — e gente já alocou e definiu coordenador na conta errada.
 *
 * Para cada grupo de homônimos ativos:
 *   - o "titular" é quem tem lançamentos de horas (desempate: mais alocações,
 *     depois e-mail corporativo);
 *   - os demais só são fundidos se NÃO tiverem nenhum lançamento de horas. Se
 *     mais de um tiver histórico de horas, o grupo é apenas reportado e nada é
 *     tocado — juntar históricos de ponto exige decisão humana.
 *
 * O duplicado é DESATIVADO, nunca apagado, e todas as referências a ele passam
 * para o titular.
 *
 * Uso:
 *   npx tsx scripts/merge-duplicate-users.ts --dry-run
 *   npx tsx scripts/merge-duplicate-users.ts --apply
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

const APLICAR = process.argv.includes('--apply');

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const ehCorporativo = (email: string) => !email.endsWith('@legacy.tec3.local');

/**
 * A conta-sombra é reconhecível pela procedência, não pelo volume de dados: o
 * import por lista de nomes gerou o e-mail a partir do próprio nome completo
 * ("robson.siqueira.filadelfo.dos.santos@legacy.tec3.local"), enquanto o import
 * por login usou o usuário real ("rsantos@..."). Sem esse teste, o critério de
 * "quem tem mais histórico" desativaria a conta corporativa de quem usa o
 * sistema hoje mas tem pouco lançamento — foi o caso do Rodrigo Cristiano.
 */
const ehSombraDoNome = (u: { name: string; email: string }) => {
  const slug = norm(u.name).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  return u.email.toLowerCase() === `${slug}@legacy.tec3.local`;
};

interface Perfil {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lancamentos: number;
  alocacoes: number;
  coordena: number;
  coordenaPropostas: number;
  notificacoes: number;
  atividades: number;
  favoritos: number;
  aprovacoes: number;
}

async function perfilar(u: { id: string; name: string; email: string; role: string; isActive: boolean }): Promise<Perfil> {
  const [lancamentos, alocacoes, coordena, coordenaPropostas, notificacoes, atividades, favoritos, aprovacoes] =
    await Promise.all([
      prisma.timeEntry.count({ where: { collaboratorId: u.id } }),
      prisma.projectMember.count({ where: { userId: u.id } }),
      prisma.project.count({ where: { coordinatorId: u.id } }),
      prisma.proposal.count({ where: { coordinatorId: u.id } }),
      prisma.notification.count({ where: { userId: u.id } }),
      prisma.userActivity.count({ where: { userId: u.id } }),
      prisma.proposalFavorite.count({ where: { userId: u.id } }),
      prisma.timeEntry.count({ where: { approvedById: u.id } }),
    ]);
  return { ...u, lancamentos, alocacoes, coordena, coordenaPropostas, notificacoes, atividades, favoritos, aprovacoes };
}

/** Move tudo que aponta para `de` para apontar para `para`. */
async function reatribuir(de: Perfil, para: Perfil) {
  // projectMember tem unique(projectId, userId): se o titular já for membro,
  // a linha do duplicado é removida em vez de migrada.
  const membros = await prisma.projectMember.findMany({ where: { userId: de.id }, select: { id: true, projectId: true } });
  for (const m of membros) {
    const jaExiste = await prisma.projectMember.findFirst({
      where: { projectId: m.projectId, userId: para.id },
      select: { id: true },
    });
    if (jaExiste) await prisma.projectMember.delete({ where: { id: m.id } });
    else await prisma.projectMember.update({ where: { id: m.id }, data: { userId: para.id } });
  }

  // proposalFavorite tem unique(userId, proposalId): mesma lógica.
  const favoritos = await prisma.proposalFavorite.findMany({ where: { userId: de.id }, select: { id: true, proposalId: true } });
  for (const f of favoritos) {
    const jaExiste = await prisma.proposalFavorite.findFirst({
      where: { proposalId: f.proposalId, userId: para.id },
      select: { id: true },
    });
    if (jaExiste) await prisma.proposalFavorite.delete({ where: { id: f.id } });
    else await prisma.proposalFavorite.update({ where: { id: f.id }, data: { userId: para.id } });
  }

  await prisma.project.updateMany({ where: { coordinatorId: de.id }, data: { coordinatorId: para.id } });
  await prisma.project.updateMany({ where: { setupCompletedById: de.id }, data: { setupCompletedById: para.id } });
  await prisma.project.updateMany({ where: { completedById: de.id }, data: { completedById: para.id } });
  await prisma.proposal.updateMany({ where: { coordinatorId: de.id }, data: { coordinatorId: para.id } });
  await prisma.projectMember.updateMany({ where: { createdById: de.id }, data: { createdById: para.id } });
  await prisma.timeEntry.updateMany({ where: { collaboratorId: de.id }, data: { collaboratorId: para.id } });
  await prisma.timeEntry.updateMany({ where: { approvedById: de.id }, data: { approvedById: para.id } });
  await prisma.notification.updateMany({ where: { userId: de.id }, data: { userId: para.id } });
  await prisma.userActivity.updateMany({ where: { userId: de.id }, data: { userId: para.id } });

  await prisma.user.update({ where: { id: de.id }, data: { isActive: false } });
}

async function main() {
  console.log(APLICAR ? '=== MODO GRAVAÇÃO ===' : '=== SIMULAÇÃO (nada será gravado) ===\n');

  const ativos = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true, isActive: true },
    orderBy: { name: 'asc' },
  });

  const porNome = new Map<string, typeof ativos>();
  for (const u of ativos) {
    const k = norm(u.name);
    porNome.set(k, [...(porNome.get(k) ?? []), u]);
  }
  const grupos = Array.from(porNome.values()).filter((l) => l.length > 1);

  console.log(`usuários ativos: ${ativos.length} | grupos de homônimos: ${grupos.length}\n`);

  const seguros: { titular: Perfil; duplicados: Perfil[] }[] = [];
  const ambiguos: Perfil[][] = [];

  for (const grupo of grupos) {
    const perfis = await Promise.all(grupo.map(perfilar));

    // Só é sombra quem veio do import por nome E nunca lançou hora. Qualquer
    // outra combinação vira caso ambíguo e não é tocada.
    const sombras = perfis.filter((p) => ehSombraDoNome(p) && p.lancamentos === 0);
    const remanescentes = perfis.filter((p) => !sombras.includes(p));

    if (sombras.length === 0 || remanescentes.length !== 1) {
      ambiguos.push(perfis);
      continue;
    }

    seguros.push({ titular: remanescentes[0], duplicados: sombras });
  }

  console.log(`grupos fundíveis com segurança: ${seguros.length}`);
  console.log(`grupos ambíguos (mais de uma conta com horas): ${ambiguos.length}\n`);

  let refsMovidas = 0;
  for (const { titular, duplicados } of seguros) {
    for (const d of duplicados) {
      const refs = d.alocacoes + d.coordena + d.coordenaPropostas + d.notificacoes + d.atividades + d.favoritos + d.aprovacoes;
      refsMovidas += refs;
      if (refs > 0) {
        console.log(`${titular.name}`);
        console.log(`  titular:   ${titular.email} (${titular.lancamentos} lançamentos)`);
        console.log(`  desativar: ${d.email} -> move ${refs} referência(s): aloc=${d.alocacoes} coordProj=${d.coordena} coordProp=${d.coordenaPropostas} notif=${d.notificacoes} ativ=${d.atividades} fav=${d.favoritos} aprov=${d.aprovacoes}`);
      }
    }
  }

  if (ambiguos.length) {
    console.log('\n--- AMBÍGUOS, não tocados ---');
    for (const grupo of ambiguos) {
      console.log(`${grupo[0].name}`);
      for (const p of grupo) {
        console.log(`  ${p.email.padEnd(40)} | ${p.role.padEnd(9)} | lançamentos=${p.lancamentos} alocações=${p.alocacoes} coordena=${p.coordena}`);
      }
    }
  }

  const totalDuplicados = seguros.reduce((s, g) => s + g.duplicados.length, 0);
  console.log(`\ncontas a desativar: ${totalDuplicados} | referências a mover: ${refsMovidas}`);

  if (!APLICAR) {
    console.log('\nnada foi gravado. rode com --apply para aplicar.');
    return;
  }

  const backupDir = path.resolve('backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `merge-users-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ geradoEm: new Date().toISOString(), seguros, ambiguos }, null, 2));
  console.log(`\nbackup: ${backupPath}`);

  for (const { titular, duplicados } of seguros) {
    for (const d of duplicados) await reatribuir(d, titular);
  }

  const restantes = await prisma.user.count({ where: { isActive: true } });
  console.log(`concluído. usuários ativos: ${restantes}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
