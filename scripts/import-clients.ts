import * as fs from 'fs';

interface ParsedClient {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  cidade: string;
  estado: string;
}

function parseHTML(html: string): ParsedClient[] {
  const clients: ParsedClient[] = [];
  
  const rowRegex = /<tr class="text-center">\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/g;
  
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const [, , cnpj, razaoSocial, nomeFantasia, cidadeEstado] = match;
    
    let cidade = '';
    let estado = '';
    
    const cidadeEstadoClean = cidadeEstado.trim();
    if (cidadeEstadoClean && cidadeEstadoClean !== '-' && cidadeEstadoClean !== ' - ') {
      const parts = cidadeEstadoClean.split(' - ');
      if (parts.length >= 2) {
        cidade = parts[0].trim();
        estado = parts[1].trim();
      } else if (parts.length === 1) {
        cidade = parts[0].trim();
      }
    }
    
    clients.push({
      cnpj: cnpj.trim(),
      razaoSocial: razaoSocial.trim(),
      nomeFantasia: nomeFantasia.trim(),
      cidade,
      estado
    });
  }
  
  return clients;
}

async function importClients() {
  const htmlPath = 'attached_assets/Pasted--DOCTYPE-html-html-lang-en-head-meta-charset-utf-8-meta_1769626801410.txt';
  const html = fs.readFileSync(htmlPath, 'utf-8');
  
  const clients = parseHTML(html);
  console.log(`Total de clientes encontrados: ${clients.length}`);
  
  const baseUrl = 'http://localhost:5000/api';
  
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' })
  });
  
  if (!loginResponse.ok) {
    throw new Error('Falha no login');
  }
  
  const { accessToken } = await loginResponse.json() as { accessToken: string };
  console.log('Login realizado com sucesso');
  
  let imported = 0;
  let errors = 0;
  
  for (const client of clients) {
    try {
      const response = await fetch(`${baseUrl}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          cnpj: client.cnpj || null,
          razaoSocial: client.razaoSocial,
          nomeFantasia: client.nomeFantasia || null,
          pais: 'Brasil',
          cidade: client.cidade || null,
          estado: client.estado || null
        })
      });
      
      if (response.ok) {
        imported++;
        console.log(`[${imported}/${clients.length}] Importado: ${client.razaoSocial}`);
      } else {
        errors++;
        console.error(`Erro ao importar ${client.razaoSocial}: ${response.statusText}`);
      }
    } catch (error) {
      errors++;
      console.error(`Erro ao importar ${client.razaoSocial}:`, error);
    }
  }
  
  console.log('\n=== RESUMO ===');
  console.log(`Total encontrados: ${clients.length}`);
  console.log(`Importados com sucesso: ${imported}`);
  console.log(`Erros: ${errors}`);
}

importClients().catch(console.error);
