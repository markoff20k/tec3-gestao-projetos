import 'dotenv/config';
import { Client } from 'ldapts';

const url = process.env.LDAP_AD_URL!;
const baseDn = process.env.LDAP_AD_BASE_DN!;
const bindDn = process.env.LDAP_AD_BIND_DN!;
const bindPassword = process.env.LDAP_AD_BIND_PASSWORD!;

console.log(`conectando em ${url} (base ${baseDn})`);
const client = new Client({ url, timeout: 10000, connectTimeout: 10000 });

try {
  await client.bind(bindDn, bindPassword);
  console.log('bind ok\n');

  const { searchEntries } = await client.search(baseDn, {
    scope: 'sub',
    filter: '(&(objectClass=group)(cn=GG-APP-GESTAO-*))',
    attributes: ['cn', 'distinguishedName', 'description', 'member'],
  });

  console.log(`grupos GG-APP-GESTAO-* encontrados: ${searchEntries.length}\n`);

  for (const g of searchEntries.sort((a, b) => String(a.cn).localeCompare(String(b.cn)))) {
    const membros = Array.isArray(g.member) ? g.member : g.member ? [g.member] : [];
    console.log(`${String(g.cn)}`);
    console.log(`  DN: ${String(g.distinguishedName ?? g.dn)}`);
    if (g.description) console.log(`  descrição: ${String(g.description)}`);
    console.log(`  membros: ${membros.length}`);
    for (const m of membros.slice(0, 8)) {
      const cn = String(m).match(/^CN=([^,]+)/)?.[1] ?? String(m);
      console.log(`    - ${cn}`);
    }
    if (membros.length > 8) console.log(`    ... e mais ${membros.length - 8}`);
    console.log('');
  }
} catch (e) {
  console.error('falha ao consultar o AD:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.unbind().catch(() => {});
}
