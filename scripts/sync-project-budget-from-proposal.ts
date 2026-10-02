/**
 * Alinha o orçamento de cada projeto ao total da proposta que o gerou pelo TAP,
 * somando os aditivos vinculados.
 *
 * Faz duas coisas, nesta ordem:
 *  1. traz mobilização e desconto do legado para a proposta, porque eles compõem
 *     o total junto com as categorias e antes só existiam no MySQL antigo;
 *  2. recalcula o total de cada proposta e, em seguida, o orçamento do projeto.
 *
 * Projeto sem proposta de origem NÃO é tocado: o orçamento dele veio de outro
 * caminho (import do legado, cadastro manual) e zerá-lo seria destruir dado.
 *
 * Uso:
 *   npx tsx scripts/sync-project-budget-from-proposal.ts --dry-run
 *   npx tsx scripts/sync-project-budget-from-proposal.ts --apply
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';
import { recomputeProposalTotals, syncProjectBudgetFromProposals } from '../server/proposalTotals.ts';

const APLICAR = process.argv.includes('--apply');
const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function carregarAjustesDoLegado() {
  const url = process.env.LDAP_AD_URL; // só para falhar cedo se o .env não estiver carregado
  if (!process.env.LEGACY_DB_HOST) throw new Error('LEGACY_DB_HOST ausente');
  void url;

  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST!,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER!,
    password: process.env.LEGACY_DB_PASSWORD!,
    database: process.env.LEGACY_DB_NAME!,
  });
  try {
    const [rows] = await conn.query<any[]>(
      'SELECT codigoProposta, valorMobilizacao, valorDesconto FROM Proposta'
    );
    return new Map(
      rows.map((r) => [
        String(r.codigoProposta ?? '').trim(),
        { mobilizacao: Number(r.valorMobilizacao ?? 0), desconto: Number(r.valorDesconto ?? 0) },
      ])
    );
  } finally {
    await conn.end();
  }
}

async function main() {
  console.log(APLICAR ? '=== MODO GRAVAÇÃO ===\n' : '=== SIMULAÇÃO (nada será gravado) ===\n');

  const ajustes = await carregarAjustesDoLegado();
  console.log(`legado: ${ajustes.size} propostas com mobilização/desconto\n`);

  // --- 1) mobilização e desconto nas propostas ---
  const propostas = await prisma.proposal.findMany({
    select: { id: true, code: true, mobilizationValue: true, discountValue: true },
  });

  let comAjuste = 0;
  for (const p of propostas) {
    const legado = ajustes.get(p.code.trim());
    if (!legado) continue;
    if (legado.mobilizacao === 0 && legado.desconto === 0) continue;
    comAjuste += 1;
    if (APLICAR) {
      await prisma.proposal.update({
        where: { id: p.id },
        data: { mobilizationValue: legado.mobilizacao, discountValue: legado.desconto },
      });
    }
  }
  console.log(`propostas que recebem mobilização/desconto: ${comAjuste}`);

  // --- 2) totais das propostas e orçamento dos projetos ---
  const projetos = await prisma.project.findMany({ select: { id: true, code: true, budgetValue: true, budgetHours: true } });

  const backupDir = path.resolve('backups');
  const backupPath = path.join(backupDir, `project-budgets-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  if (APLICAR) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        { geradoEm: new Date().toISOString(), projetos: projetos.map((p) => ({ id: p.id, code: p.code, budgetValue: String(p.budgetValue), budgetHours: p.budgetHours })) },
        null,
        2
      )
    );
    console.log(`backup: ${backupPath}`);
  }

  let semBase = 0;
  let iguais = 0;
  let mudam = 0;
  let zerados = 0;
  let placeholders = 0;
  const exemplos: string[] = [];
  const listaPlaceholders: string[] = [];

  for (const proj of projetos) {
    // Recalcula as propostas do projeto antes de somar.
    if (APLICAR) {
      const vinculadas = await prisma.proposal.findMany({ where: { projectId: proj.id }, select: { id: true } });
      for (const v of vinculadas) await recomputeProposalTotals(v.id);
    }

    // Descobre o valor antes de gravar, para poder recusar placeholders.
    const previa = await syncProjectBudgetFromProposals(proj.id, { dryRun: true });
    if (!previa) { semBase += 1; continue; }

    // O legado guarda 1 hora / R$ 0,10 nos projetos administrativos. Gravar isso
    // como orçamento faria a saúde acusar consumo de centenas de milhares por
    // cento; sem orçamento, ela apenas informa que não há base para avaliar.
    // Zero não é placeholder, é ausência de dado — e gravar 0 sobre 0 não muda
    // nada. O que precisa ser recusado é o valor simbólico: 1 hora, R$ 0,10.
    const ehPlaceholder =
      (previa.budgetHours > 0 && previa.budgetHours <= 1) ||
      (previa.budgetValue > 0 && previa.budgetValue <= 1);

    if (ehPlaceholder) {
      placeholders += 1;
      if (listaPlaceholders.length < 12) {
        listaPlaceholders.push(`${proj.code.padEnd(8)} | ${previa.budgetHours}h / R$ ${brl(previa.budgetValue)}`);
      }
      continue;
    }

    const resultado = APLICAR
      ? await syncProjectBudgetFromProposals(proj.id)
      : previa;
    if (!resultado) { semBase += 1; continue; }

    const antes = Number(proj.budgetValue);
    const mudou = Math.abs(resultado.budgetValue - antes) >= 0.02;

    if (!mudou) { iguais += 1; continue; }
    mudam += 1;
    if (antes <= 0) zerados += 1;

    if (exemplos.length < 15) {
      exemplos.push(
        `${proj.code.padEnd(8)} | ${brl(antes).padStart(14)} -> ${brl(resultado.budgetValue).padStart(14)} | base ${resultado.baseCode}${resultado.additives ? ` + ${resultado.additives} aditivo(s)` : ''}`
      );
    }
  }

  console.log('\nexemplos:');
  for (const e of exemplos) console.log('  ' + e);

  console.log('\nprojetos:');
  console.log(`  sem proposta de origem, não tocados: ${semBase}`);
  console.log(`  já batem com a proposta:             ${iguais}`);
  console.log(`  mudam de valor:                      ${mudam}`);
  console.log(`    destes, estavam zerados:           ${zerados}`);
  console.log(`  placeholder do legado, ignorados:    ${placeholders}`);
  if (listaPlaceholders.length) {
    console.log('  amostra de placeholders ignorados:');
    for (const l of listaPlaceholders) console.log('    ' + l);
  }

  if (!APLICAR) console.log('\nnada foi gravado. rode com --apply para aplicar.');
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
