import 'dotenv/config';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';

/**
 * Importa a alocação de equipe do sistema legado (tabela ProjetoProfissional).
 *
 * No legado o acesso ao apontamento é dado por alocação — inclusive nos projetos
 * administrativos, onde praticamente toda a empresa está alocada. Sem isso, o
 * colaborador não enxerga o projeto na grade de horas.
 *
 * Casamento de usuário: primeiro pelo login (prefixo do e-mail), depois pelo
 * nome completo — e, no nome, só quando houver exatamente um usuário ativo
 * correspondente, para não acertar a pessoa errada em caso de homônimo.
 */
const normalize = (value: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER,
    password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME,
  });

  const [links] = await conn.query<any[]>(
    'SELECT codigoProjeto, userProfissional, coordenador FROM ProjetoProfissional'
  );
  const [legacyUsers] = await conn.query<any[]>('SELECT userUsuario, nome FROM Usuario');
  await conn.end();

  const nameByLogin = new Map<string, string>(
    legacyUsers.map((u) => [normalize(u.userUsuario), String(u.nome ?? '').trim()])
  );

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, isActive: true },
  });

  const byLogin = new Map<string, string>();
  const idsByName = new Map<string, string[]>();
  for (const user of users) {
    byLogin.set(normalize(String(user.email).split('@')[0]), user.id);
    if (user.isActive) {
      const key = normalize(user.name);
      idsByName.set(key, [...(idsByName.get(key) ?? []), user.id]);
    }
  }

  const projects = await prisma.project.findMany({ select: { id: true, code: true } });
  const projectByCode = new Map(projects.map((p) => [normalize(p.code), p.id]));

  let porLogin = 0;
  let porNome = 0;
  let aplicados = 0;
  const semProjeto = new Set<string>();
  const semUsuario = new Set<string>();
  const ambiguos = new Set<string>();

  for (const link of links) {
    const login = normalize(link.userProfissional);
    const projectId = projectByCode.get(normalize(link.codigoProjeto));

    if (!projectId) {
      semProjeto.add(String(link.codigoProjeto));
      continue;
    }

    let userId = byLogin.get(login);
    if (userId) {
      porLogin += 1;
    } else {
      const nome = nameByLogin.get(login);
      const candidatos = nome ? idsByName.get(normalize(nome)) ?? [] : [];
      if (candidatos.length === 1) {
        userId = candidatos[0];
        porNome += 1;
      } else {
        (candidatos.length > 1 ? ambiguos : semUsuario).add(login);
        continue;
      }
    }

    if (!dryRun) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: { projectId, userId, isActive: true },
        update: { isActive: true },
      });
    }
    aplicados += 1;
  }

  console.log('Importação de alocação de equipe do legado');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- vínculos na origem: ${links.length}`);
  console.log(`- aplicados: ${aplicados} (por login: ${porLogin} | por nome: ${porNome})`);
  console.log(`- projeto inexistente: ${semProjeto.size} códigos`);
  console.log(`- usuário não encontrado: ${semUsuario.size}${semUsuario.size ? ' -> ' + [...semUsuario].join(', ') : ''}`);
  console.log(`- nome ambíguo (não aplicado): ${ambiguos.size}${ambiguos.size ? ' -> ' + [...ambiguos].join(', ') : ''}`);
}

main()
  .catch((error) => {
    console.error('Falha na importação de alocação:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
