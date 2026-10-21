/**
 * Salva e devolve o que existe SÓ no sistema novo, para sobreviver a uma
 * reimportação completa do legado.
 *
 * O import limpa o banco e reconstrói tudo a partir do legado. O que foi criado
 * aqui dentro — contas de acesso, lançamentos de horas feitos pela equipe,
 * a regra de saúde — não está no legado e sumiria sem isto.
 *
 * Na volta, nada é identificado por id: todos os ids são regerados no import.
 * O casamento é por chave de negócio (e-mail do usuário, código do projeto,
 * nome da atividade), e o que não casar é relatado em vez de ser inventado.
 *
 * Uso:
 *   npx tsx scripts/preserve-system-data.ts --export
 *   npx tsx scripts/preserve-system-data.ts --restore --file=backups/<arquivo>.json
 *   npx tsx scripts/preserve-system-data.ts --restore --file=... --dry-run
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';

const args = process.argv.slice(2);
const EXPORTAR = args.includes('--export');
const RESTAURAR = args.includes('--restore');
const DRY_RUN = args.includes('--dry-run');
const ARQUIVO = args.find((a) => a.startsWith('--file='))?.slice('--file='.length);

const normalizar = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Logins e nomes que existem no legado. Quem não está aqui é conta do sistema novo. */
async function identidadesDoLegado() {
  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER,
    password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME,
    charset: 'utf8mb4',
  });
  try {
    // Somente leitura: o legado nunca é alterado por este script.
    const [linhas] = await conn.query<any[]>('SELECT userUsuario, nome, email FROM Usuario');
    return {
      nomes: new Set(linhas.map((u) => normalizar(u.nome))),
      emails: new Set(linhas.map((u) => normalizar(u.email)).filter(Boolean)),
    };
  } finally {
    await conn.end();
  }
}

async function exportar() {
  const legado = await identidadesDoLegado();

  const usuarios = await prisma.user.findMany();
  const doSistema = usuarios.filter(
    (u) => !legado.nomes.has(normalizar(u.name)) && !legado.emails.has(normalizar(u.email))
  );

  // Lançamentos digitados no sistema novo. Os importados vêm marcados como
  // legado e serão recriados pelo próprio import.
  const lancamentos = await prisma.timeEntry.findMany({
    where: { isLegacyImport: false },
    include: {
      project: { select: { code: true } },
      costCenter: { select: { code: true } },
      activity: { select: { name: true } },
    },
  });

  const colaboradores = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(lancamentos.map((e) => e.collaboratorId))) } },
    select: { id: true, email: true, name: true },
  });
  const aprovadores = await prisma.user.findMany({
    where: { id: { in: lancamentos.map((e) => e.approvedById).filter((v): v is string => Boolean(v)) } },
    select: { id: true, email: true, name: true },
  });
  const porId = new Map([...colaboradores, ...aprovadores].map((u) => [u.id, u]));

  const regrasSaude = await prisma.projectHealthRule.findMany({
    include: { project: { select: { code: true } } } as any,
  });

  const grupos = await prisma.accessGroup.findMany({
    select: { key: true, name: true, description: true, directoryDn: true, permissions: true, isActive: true },
    orderBy: { key: 'asc' },
  });

  const pacote = {
    geradoEm: new Date().toISOString(),
    usuarios: doSistema,
    lancamentos: lancamentos.map((e) => ({
      projetoCodigo: e.project?.code ?? null,
      centroCustoCodigo: e.costCenter?.code ?? null,
      atividadeNome: e.activity?.name ?? null,
      colaboradorEmail: porId.get(e.collaboratorId)?.email ?? null,
      colaboradorNome: porId.get(e.collaboratorId)?.name ?? null,
      aprovadorEmail: e.approvedById ? porId.get(e.approvedById)?.email ?? null : null,
      entryDate: e.entryDate,
      hours: e.hours,
      description: e.description,
      attachments: e.attachments,
      status: e.status,
      approvedAt: e.approvedAt,
      rejectionReason: e.rejectionReason,
    })),
    regrasSaude: regrasSaude.map((r: any) => ({ ...r, projetoCodigo: r.project?.code ?? null, project: undefined })),
    gruposAcesso: grupos,
  };

  fs.mkdirSync('backups', { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = path.join('backups', `system-data-${carimbo}.json`);
  fs.writeFileSync(destino, JSON.stringify(pacote, null, 2), 'utf8');

  console.log(`Salvo em ${destino}`);
  console.log(`  usuarios fora do legado: ${pacote.usuarios.length}`);
  for (const u of doSistema) console.log(`     ${u.name} <${u.email}> role=${u.role}`);
  console.log(`  lancamentos do sistema novo: ${pacote.lancamentos.length}`);
  for (const e of pacote.lancamentos) {
    console.log(`     ${String(e.entryDate).slice(0, 10)} ${String(e.hours)}h ${e.status} ${e.colaboradorNome} ${e.projetoCodigo}`);
  }
  console.log(`  regras de saude: ${pacote.regrasSaude.length}`);
  console.log(`  grupos de acesso: ${pacote.gruposAcesso.length}`);
  return destino;
}

async function restaurar(arquivo: string) {
  const pacote = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  console.log(`Restaurando de ${arquivo} (gerado em ${pacote.geradoEm})`);
  if (DRY_RUN) console.log('MODO DRY-RUN: nada sera gravado.\n');

  // --- usuarios -----------------------------------------------------------
  let criados = 0;
  let jaExistiam = 0;
  for (const u of pacote.usuarios ?? []) {
    const existente = await prisma.user.findUnique({ where: { email: u.email } });
    if (existente) {
      jaExistiam++;
      console.log(`  = ${u.email} ja existe apos o import`);
      continue;
    }
    // A categoria profissional pode ter sumido na limpeza; melhor gravar sem
    // ela do que falhar a restauracao inteira por causa de uma FK.
    const categoriaOk = u.professionalCategoryId
      ? await prisma.activity.findUnique({ where: { id: u.professionalCategoryId } }).catch(() => null)
      : null;

    console.log(`  + ${u.name} <${u.email}> role=${u.role}`);
    if (!DRY_RUN) {
      const { professionalCategoryId, ...resto } = u;
      await prisma.user.create({
        data: { ...resto, professionalCategoryId: categoriaOk ? professionalCategoryId : null },
      });
    }
    criados++;
  }
  console.log(`  usuarios: ${criados} recriados, ${jaExistiam} ja presentes`);

  // --- lancamentos de horas ----------------------------------------------
  let horasOk = 0;
  const horasFalha: string[] = [];
  for (const e of pacote.lancamentos ?? []) {
    const projeto = e.projetoCodigo
      ? await prisma.project.findFirst({ where: { code: e.projetoCodigo }, select: { id: true } })
      : null;
    const colaborador = e.colaboradorEmail
      ? await prisma.user.findUnique({ where: { email: e.colaboradorEmail }, select: { id: true } })
      : null;

    if (!projeto || !colaborador) {
      horasFalha.push(`${e.projetoCodigo}/${e.colaboradorEmail}: ${!projeto ? 'projeto' : 'colaborador'} nao encontrado apos o import`);
      continue;
    }

    const centro = e.centroCustoCodigo
      ? await prisma.costCenter.findUnique({ where: { code: e.centroCustoCodigo }, select: { id: true } })
      : null;
    const atividade = e.atividadeNome
      ? await prisma.activity.findFirst({ where: { name: e.atividadeNome }, select: { id: true } })
      : null;
    const aprovador = e.aprovadorEmail
      ? await prisma.user.findUnique({ where: { email: e.aprovadorEmail }, select: { id: true } })
      : null;

    const duplicado = await prisma.timeEntry.findFirst({
      where: {
        projectId: projeto.id,
        collaboratorId: colaborador.id,
        entryDate: new Date(e.entryDate),
        hours: e.hours,
      },
      select: { id: true },
    });
    if (duplicado) {
      console.log(`  = lancamento ${String(e.entryDate).slice(0, 10)} ${e.projetoCodigo} ja existe`);
      continue;
    }

    console.log(`  + lancamento ${String(e.entryDate).slice(0, 10)} ${e.hours}h ${e.colaboradorNome} ${e.projetoCodigo}`);
    if (!DRY_RUN) {
      await prisma.timeEntry.create({
        data: {
          projectId: projeto.id,
          collaboratorId: colaborador.id,
          costCenterId: centro?.id ?? null,
          activityId: atividade?.id ?? null,
          entryDate: new Date(e.entryDate),
          hours: e.hours,
          description: e.description,
          attachments: e.attachments ?? undefined,
          status: e.status,
          approvedById: aprovador?.id ?? null,
          approvedAt: e.approvedAt ? new Date(e.approvedAt) : null,
          rejectionReason: e.rejectionReason,
          isLegacyImport: false,
        },
      });
    }
    horasOk++;
  }
  console.log(`  lancamentos: ${horasOk} recriados, ${horasFalha.length} sem destino`);
  for (const f of horasFalha) console.log(`     ! ${f}`);

  // --- regra de saude padrao ---------------------------------------------
  for (const r of pacote.regrasSaude ?? []) {
    const { id, projectId, projetoCodigo, updatedById, createdAt, updatedAt, project, ...campos } = r;
    const projeto = projetoCodigo
      ? await prisma.project.findFirst({ where: { code: projetoCodigo }, select: { id: true } })
      : null;
    if (projetoCodigo && !projeto) {
      console.log(`  ! regra de saude do projeto ${projetoCodigo} sem destino apos o import`);
      continue;
    }
    const alvo = projeto?.id ?? null;
    const existente = await prisma.projectHealthRule.findFirst({ where: { projectId: alvo } });
    console.log(`  ${existente ? '~' : '+'} regra de saude ${projetoCodigo ?? '(padrao do sistema)'}`);
    if (DRY_RUN) continue;
    if (existente) {
      await prisma.projectHealthRule.update({ where: { id: existente.id }, data: campos });
    } else {
      await prisma.projectHealthRule.create({ data: { ...campos, projectId: alvo } });
    }
  }

  console.log(DRY_RUN ? '\nDry-run concluido.' : '\nRestauracao concluida.');
}

async function main() {
  if (EXPORTAR === RESTAURAR) {
    throw new Error('Escolha exatamente um modo: --export ou --restore');
  }
  if (EXPORTAR) {
    await exportar();
    return;
  }
  if (!ARQUIVO) throw new Error('Informe --file=backups/system-data-....json');
  await restaurar(ARQUIVO);
}

main()
  .catch((erro) => {
    console.error('Falha:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
