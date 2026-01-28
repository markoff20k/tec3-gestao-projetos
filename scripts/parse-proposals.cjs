const fs = require('fs');
const path = require('path');

// Read the HTML file
const htmlPath = path.join(__dirname, '../attached_assets/Tec3_Engenharia_1769630691430.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract all table rows
const rowRegex = /<tr class="text-center[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;

const proposals = [];
let match;

while ((match = rowRegex.exec(html)) !== null) {
  const rowHtml = match[1];
  const cells = [];
  let cellMatch;
  
  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    // Clean up the cell content
    let content = cellMatch[1]
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
    cells.push(content);
  }
  
  if (cells.length >= 24) {
    const proposal = {
      code: cells[0],
      revision: parseInt(cells[1]) || 0,
      oldCode: cells[2] || null,
      contractType: cells[3] || 'Preço fechado',
      umbrellaProposal: cells[4] || null,
      clientName: cells[5],
      coordinatorName: cells[6],
      title: cells[7],
      requestDate: parseDate(cells[8]),
      issueDate: parseDate(cells[9]),
      validityDate: parseDate(cells[10]),
      updateDate: parseDate(cells[11]),
      situation: cells[12],
      expectation: cells[13] || null,
      mainType: cells[14] || null,
      termMonths: parseInt(cells[15]) || 0,
      riskAssessment: cells[16] || 'Não',
      mobilizationValue: parseValue(cells[17]),
      subcontractingValue: parseValue(cells[18]),
      categoryValue: parseValue(cells[19]),
      expensesValue: parseValue(cells[20]),
      additivesValue: parseValue(cells[21]),
      discountValue: parseValue(cells[22]),
      totalValue: parseValue(cells[23]),
      observations: cells[24] || null
    };
    
    proposals.push(proposal);
  }
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

function parseValue(valueStr) {
  if (!valueStr || valueStr.trim() === '') return 0;
  const cleaned = valueStr.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

// Map contract types
const typeMap = {
  'Preço fechado': 'fixed_price',
  'Apropriação': 'appropriation',
  'Guarda-chuva': 'umbrella',
  'Ordem de serviço': 'service_order',
  'Aditivo': 'additive',
  'Preço sob demanda': 'appropriation'
};

// Map status/situation
const statusMap = {
  'Sucesso': 'converted',
  'Sucesso (aditivo)': 'converted',
  'Aprovada': 'approved',
  'Em elaboração': 'draft',
  'Em análise': 'in_review',
  'Em negociação': 'negotiating',
  'Enviada': 'sent',
  'Reprovada': 'rejected',
  'Não sucesso': 'rejected',
  'Cancelada': 'cancelled',
  'Pendente': 'in_review'
};

console.log(`Total proposals found: ${proposals.length}`);

// Generate SQL - Using correct Prisma schema table/column names
let sql = `-- Import proposals from legacy system
-- Generated on ${new Date().toISOString()}
-- Total: ${proposals.length} proposals

`;

// Group by unique proposals (some might have different revisions)
const uniqueProposals = new Map();
for (const p of proposals) {
  // Make code unique by appending revision if > 0
  const uniqueCode = p.revision > 0 ? `${p.code}-R${p.revision}` : p.code;
  if (!uniqueProposals.has(uniqueCode)) {
    uniqueProposals.set(uniqueCode, { ...p, uniqueCode });
  }
}

console.log(`Unique proposals: ${uniqueProposals.size}`);

// Generate INSERT statements using correct column names
// Use fallback client ID when no matching client is found
sql += `-- INSERT proposals
-- Fallback client ID for unmatched clients: 00000000-0000-0000-0000-000000000001

INSERT INTO "proposals" (
  "id", "code", "revision", "title", "description", "client_id", "coordinator_name",
  "type", "status", "total_value", "estimated_hours", "sent_date", "created_at"
)
SELECT
  gen_random_uuid(),
  v.code,
  v.revision,
  v.title,
  v.observations,
  COALESCE(c.id, '00000000-0000-0000-0000-000000000001'),
  v.coordinator_name,
  v.prop_type,
  v.prop_status,
  v.total_value,
  0,
  v.issue_date,
  COALESCE(v.request_date, NOW())
FROM (VALUES
`;

const values = [];

for (const [key, p] of uniqueProposals) {
  const type = typeMap[p.contractType] || 'fixed_price';
  const status = statusMap[p.situation] || 'draft';
  
  // Escape single quotes
  const title = (p.title || 'Sem título').replace(/'/g, "''");
  const obs = p.observations ? p.observations.replace(/'/g, "''") : null;
  const coordinator = p.coordinatorName ? p.coordinatorName.replace(/'/g, "''") : null;
  const clientName = p.clientName ? p.clientName.replace(/'/g, "''") : '';
  
  const issueDate = p.issueDate ? `'${p.issueDate}'::timestamp` : 'NULL';
  const requestDate = p.requestDate ? `'${p.requestDate}'::timestamp` : 'NULL';
  
  values.push(`  ('${p.uniqueCode}', ${p.revision}, '${title}', ${obs ? `'${obs}'` : 'NULL'}, '${clientName}', ${coordinator ? `'${coordinator}'` : 'NULL'}, '${type}', '${status}', ${p.totalValue}, ${issueDate}, ${requestDate})`);
}

sql += values.join(',\n');
sql += `
) AS v(code, revision, title, observations, client_name, coordinator_name, prop_type, prop_status, total_value, issue_date, request_date)
LEFT JOIN "clients" c ON UPPER(TRIM(c."razao_social")) = UPPER(TRIM(v.client_name))
ON CONFLICT ("code") DO NOTHING;

-- Summary
SELECT 
  COUNT(*) as total_proposals,
  COUNT(DISTINCT "client_id") as unique_clients,
  SUM("total_value") as total_value
FROM "proposals";
`;

// Write SQL file
fs.writeFileSync(path.join(__dirname, 'import-proposals-production.sql'), sql);
console.log('SQL file generated: scripts/import-proposals-production.sql');

// Output summary by status
const statusCounts = {};
for (const [key, p] of uniqueProposals) {
  const status = p.situation || 'Sem status';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
}
console.log('\nProposals by status:');
for (const [status, count] of Object.entries(statusCounts)) {
  console.log(`  ${status}: ${count}`);
}

// Summary by type
const typeCounts = {};
for (const [key, p] of uniqueProposals) {
  const type = p.contractType || 'Sem tipo';
  typeCounts[type] = (typeCounts[type] || 0) + 1;
}
console.log('\nProposals by type:');
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`  ${type}: ${count}`);
}
