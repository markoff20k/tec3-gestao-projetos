/**
 * Repara as linhas de categoria das propostas vindas do legado e passa a
 * totalizá-las na proposta e no projeto.
 *
 * Três defeitos do import original são corrigidos aqui:
 *
 *  1. parseDecimal apagava todo ponto do texto, supondo formato brasileiro. A
 *     coluna valorHora do MySQL é numérica e chega como "379.707", com ponto
 *     decimal — todo preço-hora ficou mil vezes maior.
 *  2. ValorCategoriaProposta guarda um conjunto de linhas por revisão, e o
 *     import trouxe todas as revisões para o único registro da proposta. Daí as
 *     linhas duplicadas e as horas dobradas.
 *  3. proposal.totalValue recebeu valorSubcontratacao, que não é o total.
 *
 * O total segue a mesma fórmula que link-legacy-project-budget-values.ts já usa
 * para o orçamento do projeto, para os dois números não discordarem entre si:
 *
 *     total = Σ(valorHora × quantidadeHoras) + mobilização − desconto
 *
 * Desconto é tratado sempre em reais, conforme decisão do cliente.
 *
 * Uso:
 *   npx tsx scripts/repair-legacy-proposal-totals.ts --dry-run
 *   npx tsx scripts/repair-legacy-proposal-totals.ts --apply
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';

const APLICAR = process.argv.includes('--apply');
const LIMITE = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? Number.parseInt(arg.split('=')[1], 10) : 0;
})();

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizeName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface LinhaLegado {
  codigoProposta: string;
  revisao: number;
  idCategoria: string | null;
  nomeCategoria: string | null;
  valorHora: number;
  quantidadeHoras: number;
}

interface PropostaLegado {
  codigoProposta: string;
  revisao: number;
  mobilizacao: number;
  subcontratacao: number;
  desconto: number;
}

async function carregarLegado() {
  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST!,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER!,
    password: process.env.LEGACY_DB_PASSWORD!,
    database: process.env.LEGACY_DB_NAME!,
  });

  try {
    const [props] = await conn.query<any[]>(`
      SELECT codigoProposta, revisao, valorMobilizacao, valorSubcontratacao, valorDesconto
        FROM Proposta
    `);
    const [linhas] = await conn.query<any[]>(`
      SELECT v.codigoProposta, v.revisao, v.idCategoria, c.nome AS nomeCategoria,
             v.valorHora, v.quantidadeHoras
        FROM ValorCategoriaProposta v
        LEFT JOIN Categoria c ON c.idCategoria = v.idCategoria
    `);

    const propostas = new Map<string, PropostaLegado>();
    for (const p of props) {
      const codigo = String(p.codigoProposta ?? '').trim();
      if (!codigo) continue;
      propostas.set(codigo, {
        codigoProposta: codigo,
        revisao: Number(p.revisao ?? 0),
        mobilizacao: Number(p.valorMobilizacao ?? 0),
        subcontratacao: Number(p.valorSubcontratacao ?? 0),
        desconto: Number(p.valorDesconto ?? 0),
      });
    }

    // Indexado por codigo -> revisao -> linhas.
    const porCodigo = new Map<string, Map<number, LinhaLegado[]>>();
    for (const l of linhas) {
      const codigo = String(l.codigoProposta ?? '').trim();
      if (!codigo) continue;
      const revisao = Number(l.revisao ?? 0);
      const porRevisao = porCodigo.get(codigo) ?? new Map<number, LinhaLegado[]>();
      const lista = porRevisao.get(revisao) ?? [];
      lista.push({
        codigoProposta: codigo,
        revisao,
        idCategoria: l.idCategoria != null ? String(l.idCategoria) : null,
        nomeCategoria: l.nomeCategoria ?? null,
        valorHora: Number(l.valorHora ?? 0),
        quantidadeHoras: Number(l.quantidadeHoras ?? 0),
      });
      porRevisao.set(revisao, lista);
      porCodigo.set(codigo, porRevisao);
    }

    return { propostas, porCodigo };
  } finally {
    await conn.end();
  }
}

/** A revisão vigente da proposta; se ela não tiver linhas, a maior revisão que tiver. */
function escolherRevisao(porRevisao: Map<number, LinhaLegado[]>, revisaoAtual: number) {
  if (porRevisao.has(revisaoAtual) && (porRevisao.get(revisaoAtual) as LinhaLegado[]).length > 0) {
    return { revisao: revisaoAtual, usouFallback: false };
  }
  const disponiveis = Array.from(porRevisao.keys())
    .filter((r) => (porRevisao.get(r) as LinhaLegado[]).length > 0)
    .sort((a, b) => b - a);
  if (disponiveis.length === 0) return null;
  return { revisao: disponiveis[0], usouFallback: true };
}

async function main() {
  console.log(APLICAR ? '=== MODO GRAVAÇÃO ===' : '=== SIMULAÇÃO (nada será gravado) ===');

  const { propostas: legadoPropostas, porCodigo } = await carregarLegado();
  console.log(`legado: ${legadoPropostas.size} propostas, ${porCodigo.size} com linhas de categoria`);

  const categorias = await prisma.proposalCategory.findMany({ select: { id: true, name: true } });
  const categoriaPorNome = new Map(categorias.map((c) => [normalizeName(c.name), c.id]));

  let propostasNovas = await prisma.proposal.findMany({
    select: { id: true, code: true, revision: true, totalValue: true, estimatedHours: true },
    orderBy: { code: 'asc' },
  });
  if (LIMITE > 0) propostasNovas = propostasNovas.slice(0, LIMITE);
  console.log(`banco novo: ${propostasNovas.length} propostas a processar\n`);

  // Backup do estado atual, antes de qualquer escrita.
  const backupDir = path.resolve('backups');
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `proposal-totals-${carimbo}.json`);

  const linhasAtuais = await prisma.proposalCategoryValue.findMany();
  const projetosAtuais = await prisma.project.findMany({
    select: { id: true, code: true, budgetValue: true, budgetHours: true, legacyProposalCode: true, legacyRevision: true },
  });

  if (APLICAR) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        {
          geradoEm: new Date().toISOString(),
          propostas: propostasNovas.map((p) => ({
            id: p.id, code: p.code, totalValue: String(p.totalValue), estimatedHours: p.estimatedHours,
          })),
          linhasCategoria: linhasAtuais.map((l) => ({
            id: l.id, proposalId: l.proposalId, categoryId: l.categoryId,
            customName: l.customName, value: String(l.value), hours: String(l.hours),
            isLegacyImport: l.isLegacyImport,
          })),
          projetos: projetosAtuais.map((p) => ({
            id: p.id, code: p.code, budgetValue: String(p.budgetValue), budgetHours: p.budgetHours,
          })),
        },
        null,
        2
      )
    );
    console.log(`backup gravado em ${backupPath}\n`);
  }

  const stats = {
    semLegado: 0,
    semLinhas: 0,
    fallbackRevisao: 0,
    reconstruidas: 0,
    linhasAntes: 0,
    linhasDepois: 0,
    totalAntes: 0,
    totalDepois: 0,
  };
  const exemplos: string[] = [];

  for (const proposta of propostasNovas) {
    const codigo = proposta.code.trim();
    const legado = legadoPropostas.get(codigo);
    if (!legado) { stats.semLegado += 1; continue; }

    const porRevisao = porCodigo.get(codigo);
    if (!porRevisao) { stats.semLinhas += 1; continue; }

    const escolha = escolherRevisao(porRevisao, legado.revisao);
    if (!escolha) { stats.semLinhas += 1; continue; }
    if (escolha.usouFallback) stats.fallbackRevisao += 1;

    const linhas = porRevisao.get(escolha.revisao) as LinhaLegado[];
    const mao = linhas.reduce((s, l) => s + l.valorHora * l.quantidadeHoras, 0);
    const horas = linhas.reduce((s, l) => s + l.quantidadeHoras, 0);

    // Desconto sempre em reais, conforme decidido.
    const total = Math.max(0, mao + legado.mobilizacao - legado.desconto);

    const antesTotal = Number(proposta.totalValue ?? 0);
    const antesLinhas = linhasAtuais.filter((l) => l.proposalId === proposta.id).length;

    stats.linhasAntes += antesLinhas;
    stats.linhasDepois += linhas.length;
    stats.totalAntes += antesTotal;
    stats.totalDepois += total;
    stats.reconstruidas += 1;

    if (exemplos.length < 15) {
      exemplos.push(
        `${codigo.padEnd(8)} rev${escolha.revisao}${escolha.usouFallback ? '*' : ' '} | linhas ${String(antesLinhas).padStart(3)} -> ${String(linhas.length).padStart(3)} | horas ${String(proposta.estimatedHours).padStart(6)} -> ${String(horas).padStart(6)} | total ${brl(antesTotal).padStart(14)} -> ${brl(total).padStart(14)}`
      );
    }

    if (APLICAR) {
      await prisma.$transaction(async (tx) => {
        await tx.proposalCategoryValue.deleteMany({ where: { proposalId: proposta.id } });

        for (const l of linhas) {
          const categoryId = categoriaPorNome.get(normalizeName(l.nomeCategoria)) ?? null;
          await tx.proposalCategoryValue.create({
            data: {
              proposalId: proposta.id,
              categoryId,
              customName: categoryId ? null : (l.nomeCategoria ?? null),
              value: l.valorHora,
              hours: l.quantidadeHoras,
              isLegacyImport: true,
            },
          });
        }

        await tx.proposal.update({
          where: { id: proposta.id },
          data: { totalValue: Number(total.toFixed(2)), estimatedHours: Math.round(horas) },
        });
      });
    }
  }

  console.log('exemplos:');
  for (const e of exemplos) console.log('  ' + e);
  console.log('  (* = revisão vigente sem linhas; usada a maior disponível)\n');

  console.log('propostas:');
  console.log(`  reconstruídas: ${stats.reconstruidas}`);
  console.log(`  sem correspondente no legado: ${stats.semLegado}`);
  console.log(`  sem linhas de categoria no legado: ${stats.semLinhas}`);
  console.log(`  revisão vigente vazia (fallback): ${stats.fallbackRevisao}`);
  console.log(`  linhas de categoria: ${stats.linhasAntes} -> ${stats.linhasDepois}`);
  console.log(`  soma dos totais: R$ ${brl(stats.totalAntes)} -> R$ ${brl(stats.totalDepois)}`);

  // ----- projetos -----
  const projStats = { preenchidos: 0, jaTinham: 0, divergentes: 0, semProposta: 0, placeholder: 0 };
  const divergencias: string[] = [];
  const placeholders: string[] = [];

  for (const projeto of projetosAtuais) {
    const codigo = (projeto.legacyProposalCode ?? '').trim();
    if (!codigo) { projStats.semProposta += 1; continue; }

    const legado = legadoPropostas.get(codigo);
    const porRevisao = porCodigo.get(codigo);
    if (!legado || !porRevisao) { projStats.semProposta += 1; continue; }

    const revisaoProjeto = Number.isFinite(projeto.legacyRevision as number)
      ? Number(projeto.legacyRevision)
      : legado.revisao;
    const escolha = escolherRevisao(porRevisao, revisaoProjeto);
    if (!escolha) { projStats.semProposta += 1; continue; }

    const linhas = porRevisao.get(escolha.revisao) as LinhaLegado[];
    const mao = linhas.reduce((s, l) => s + l.valorHora * l.quantidadeHoras, 0);
    const horas = Math.round(linhas.reduce((s, l) => s + l.quantidadeHoras, 0));
    const valor = Number(Math.max(0, mao + legado.mobilizacao - legado.desconto).toFixed(2));

    const valorAtual = Number(projeto.budgetValue ?? 0);
    const horasAtuais = Number(projeto.budgetHours ?? 0);

    // O legado guarda placeholders (1 hora, R$ 0,10) nos projetos administrativos
    // e afins. Gravar isso como orçamento faria a saúde acusar consumo de milhões
    // por cento; sem orçamento, ela apenas informa que não há base para avaliar.
    const ehPlaceholder = horas <= 1 || valor <= 1;
    if (ehPlaceholder) {
      projStats.placeholder += 1;
      if (placeholders.length < 12) {
        placeholders.push(`${projeto.code.padEnd(9)} | ${horas}h | R$ ${brl(valor)}`);
      }
      continue;
    }

    const dados: Record<string, unknown> = {};
    if (valorAtual <= 0 && valor > 0) dados.budgetValue = valor;
    if (horasAtuais <= 0 && horas > 0) dados.budgetHours = horas;

    // Orçamento já preenchido veio de um caminho correto: não é sobrescrito,
    // só reportado quando diverge do recálculo.
    if (valorAtual > 0 && Math.abs(valorAtual - valor) / Math.max(valorAtual, 1) > 0.01) {
      projStats.divergentes += 1;
      if (divergencias.length < 10) {
        divergencias.push(`${projeto.code.padEnd(9)} | no banco R$ ${brl(valorAtual).padStart(14)} | recalculado R$ ${brl(valor).padStart(14)}`);
      }
    }

    if (Object.keys(dados).length === 0) { projStats.jaTinham += 1; continue; }

    if (APLICAR) {
      await prisma.project.update({ where: { id: projeto.id }, data: dados as any });
    }
    projStats.preenchidos += 1;
  }

  console.log('\nprojetos:');
  console.log(`  orçamento preenchido (estava zerado): ${projStats.preenchidos}`);
  console.log(`  já tinham orçamento, mantidos: ${projStats.jaTinham}`);
  console.log(`  divergentes do recálculo (não tocados): ${projStats.divergentes}`);
  console.log(`  sem proposta no legado: ${projStats.semProposta}`);
  console.log(`  placeholder do legado, ignorados: ${projStats.placeholder}`);
  if (placeholders.length) {
    console.log('  amostra de placeholders ignorados:');
    for (const d of placeholders) console.log('    ' + d);
  }
  if (divergencias.length) {
    console.log('  amostra de divergências:');
    for (const d of divergencias) console.log('    ' + d);
  }

  if (APLICAR) console.log(`\nbackup: ${backupPath}`);
  else console.log('\nnada foi gravado. rode com --apply para aplicar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
