import { Client } from 'ldapts';

type Role = 'admin' | 'commercial' | 'projects';

type LdapAttemptStatus = 'success' | 'not_found' | 'invalid_password' | 'error';

type LdapAttemptResult =
  | {
      status: 'success';
      provider: 'ad' | 'openldap';
      profile: {
        email: string;
        name: string;
        groups: string[];
        role: Role;
      };
    }
  | { status: 'not_found'; provider: 'ad' | 'openldap' }
  | { status: 'invalid_password'; provider: 'ad' | 'openldap' }
  | { status: 'error'; provider: 'ad' | 'openldap'; error: unknown };

function getLdapHexCode(error: unknown): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null;
  if (!message) return null;
  const match = message.match(/0x[0-9a-f]+/i);
  return match ? match[0].toLowerCase() : null;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function parseCsvEnv(name: string): string[] {
  const v = env(name);
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeFilterValue(value: string): string {
  // RFC 4515
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

function normalizeDn(dn: string): string {
  return dn.trim().toLowerCase();
}

function buildRoleFromGroups(params: {
  groups: string[];
  adminDns: string[];
  commercialDns: string[];
  projectsDns: string[];
}): Role {
  const groupSet = new Set(params.groups.map(normalizeDn));
  const hasAny = (dns: string[]) => dns.map(normalizeDn).some((dn) => groupSet.has(dn));

  if (hasAny(params.adminDns)) return 'admin';
  if (hasAny(params.commercialDns)) return 'commercial';
  if (hasAny(params.projectsDns)) return 'projects';
  return 'projects';
}

function getUserAttr(entry: any, key: string): string | undefined {
  const v = entry?.[key];
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined;
  return typeof v === 'string' ? v : undefined;
}

function getUserAttrMulti(entry: any, key: string): string[] {
  const v = entry?.[key];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
  if (typeof v === 'string') return [v];
  return [];
}

async function tryAuthenticateProvider(params: {
  provider: 'ad' | 'openldap';
  url?: string;
  baseDn?: string;
  bindDn?: string;
  bindPassword?: string;
  userFilterTemplate?: string;
  roleAdminDns: string[];
  roleCommercialDns: string[];
  roleProjectsDns: string[];
  identifier: string;
  password: string;
}): Promise<LdapAttemptResult> {
  const {
    provider,
    url,
    baseDn,
    bindDn,
    bindPassword,
    userFilterTemplate,
    roleAdminDns,
    roleCommercialDns,
    roleProjectsDns,
    identifier,
    password,
  } = params;

  if (!url || !baseDn) {
    return { status: 'not_found', provider };
  }

  const client = new Client({
    url,
    timeout: 8000,
    connectTimeout: 8000,
  });

  let serviceBindOk = false;
  let serviceBindError: unknown = null;

  try {
    if (bindDn && bindPassword) {
      try {
        await client.bind(bindDn, bindPassword);
        serviceBindOk = true;
      } catch (err) {
        // Some directories allow anonymous search; if so, keep going.
        // If anonymous search is not allowed, the subsequent search will fail
        // and we'll return a helpful error.
        serviceBindError = err;
      }
    }

    const escapedId = escapeFilterValue(identifier);

    const filter =
      userFilterTemplate?.replaceAll('{{id}}', escapedId) ??
      (provider === 'ad'
        ? `(|(userPrincipalName=${escapedId})(mail=${escapedId})(sAMAccountName=${escapedId}))`
        : `(|(mail=${escapedId})(email=${escapedId})(uid=${escapedId}))`);

    const { searchEntries } = await client.search(baseDn, {
      scope: 'sub',
      filter,
      attributes: [
        'dn',
        'mail',
        'email',
        'cn',
        'displayName',
        'givenName',
        'sn',
        'memberOf',
        'sAMAccountName',
        'userPrincipalName',
        'uid',
      ],
      sizeLimit: 5,
    });

    if (!searchEntries || searchEntries.length === 0) {
      return { status: 'not_found', provider };
    }

    const entry: any = searchEntries[0];
    const userDn = getUserAttr(entry, 'dn');
    if (!userDn) {
      return { status: 'error', provider, error: new Error('LDAP entry missing DN') };
    }

    const email =
      getUserAttr(entry, 'mail') ??
      getUserAttr(entry, 'email') ??
      (identifier.includes('@') ? identifier : undefined);
    if (!email) {
      return { status: 'error', provider, error: new Error('LDAP user missing mail attribute') };
    }

    const name =
      getUserAttr(entry, 'displayName') ??
      getUserAttr(entry, 'cn') ??
      getUserAttr(entry, 'givenName') ??
      identifier;

    // Verify password by binding as the user.
    try {
      await client.bind(userDn, password);
    } catch {
      return { status: 'invalid_password', provider };
    }

    // Re-bind with service account to read groups (if configured).
    if (bindDn && bindPassword && serviceBindOk) {
      await client.bind(bindDn, bindPassword);
    }

    let groups = getUserAttrMulti(entry, 'memberOf');

    // Fallback group search if memberOf is not available.
    if (groups.length === 0) {
      const userDnEscaped = escapeFilterValue(userDn);
      const uid = getUserAttr(entry, 'uid') ?? getUserAttr(entry, 'sAMAccountName') ?? '';
      const uidEscaped = escapeFilterValue(uid);

      const groupFilter = `(|(member=${userDnEscaped})(uniqueMember=${userDnEscaped})${uid ? `(memberUid=${uidEscaped})` : ''})`;

      const groupSearch = await client.search(baseDn, {
        scope: 'sub',
        filter: groupFilter,
        attributes: ['dn'],
        sizeLimit: 200,
      });
      groups = (groupSearch.searchEntries ?? [])
        .map((g: any) => getUserAttr(g, 'dn'))
        .filter((x): x is string => Boolean(x));
    }

    const role = buildRoleFromGroups({
      groups,
      adminDns: roleAdminDns,
      commercialDns: roleCommercialDns,
      projectsDns: roleProjectsDns,
    });

    return {
      status: 'success',
      provider,
      profile: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        groups,
        role,
      },
    };
  } catch (error) {
    // If service bind failed and we got here, prefer returning a clearer message.
    const hex = getLdapHexCode(serviceBindError);
    if (serviceBindError && (hex === '0x31' || hex === '0x32')) {
      return {
        status: 'error',
        provider,
        error: new Error(
          'Falha no bind de serviço do LDAP (credenciais inválidas). Verifique LDAP_*_BIND_DN e LDAP_*_BIND_PASSWORD.'
        ),
      };
    }

    // Helpful hint: many LDAP servers deny anonymous search and respond with
    // invalidCredentials (0x31). In that case, the fix is to configure a bind DN.
    const hexError = getLdapHexCode(error);
    if (hexError === '0x31' && (!bindDn || !bindPassword)) {
      return {
        status: 'error',
        provider,
        error: new Error(
          'LDAP retornou 0x31 (invalidCredentials) durante a busca. Isso normalmente significa que busca anônima não está permitida. Configure LDAP_*_BIND_DN e LDAP_*_BIND_PASSWORD.'
        ),
      };
    }
    return { status: 'error', provider, error };
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore
    }
  }
}

export async function authenticateViaLdap(params: {
  identifier: string;
  password: string;
}): Promise<LdapAttemptResult | null> {
  const identifier = params.identifier?.trim();
  const password = params.password ?? '';
  if (!identifier || !password) return null;

  const adUrl = env('LDAP_AD_URL');
  const adBaseDn = env('LDAP_AD_BASE_DN');
  const adBindDn = env('LDAP_AD_BIND_DN');
  const adBindPassword = env('LDAP_AD_BIND_PASSWORD');
  const adUserFilter = env('LDAP_AD_USER_FILTER');

  const openUrl = env('LDAP_OPENLDAP_URL');
  const openBaseDn = env('LDAP_OPENLDAP_BASE_DN');
  const openBindDn = env('LDAP_OPENLDAP_BIND_DN');
  const openBindPassword = env('LDAP_OPENLDAP_BIND_PASSWORD');
  const openUserFilter = env('LDAP_OPENLDAP_USER_FILTER');

  const globalAdmin = parseCsvEnv('LDAP_ROLE_ADMIN_DNS');
  const globalCommercial = parseCsvEnv('LDAP_ROLE_COMMERCIAL_DNS');
  const globalProjects = parseCsvEnv('LDAP_ROLE_PROJECTS_DNS');

  const adAdmin = parseCsvEnv('LDAP_AD_ROLE_ADMIN_DNS');
  const adCommercial = parseCsvEnv('LDAP_AD_ROLE_COMMERCIAL_DNS');
  const adProjects = parseCsvEnv('LDAP_AD_ROLE_PROJECTS_DNS');

  const openAdmin = parseCsvEnv('LDAP_OPENLDAP_ROLE_ADMIN_DNS');
  const openCommercial = parseCsvEnv('LDAP_OPENLDAP_ROLE_COMMERCIAL_DNS');
  const openProjects = parseCsvEnv('LDAP_OPENLDAP_ROLE_PROJECTS_DNS');

  // 1) Try AD
  const adAttempt = await tryAuthenticateProvider({
    provider: 'ad',
    url: adUrl,
    baseDn: adBaseDn,
    bindDn: adBindDn,
    bindPassword: adBindPassword,
    userFilterTemplate: adUserFilter,
    roleAdminDns: adAdmin.length ? adAdmin : globalAdmin,
    roleCommercialDns: adCommercial.length ? adCommercial : globalCommercial,
    roleProjectsDns: adProjects.length ? adProjects : globalProjects,
    identifier,
    password,
  });

  if (adAttempt.status === 'success' || adAttempt.status === 'invalid_password') return adAttempt;

  // 2) Try OpenLDAP
  const openAttempt = await tryAuthenticateProvider({
    provider: 'openldap',
    url: openUrl,
    baseDn: openBaseDn,
    bindDn: openBindDn,
    bindPassword: openBindPassword,
    userFilterTemplate: openUserFilter,
    roleAdminDns: openAdmin.length ? openAdmin : globalAdmin,
    roleCommercialDns: openCommercial.length ? openCommercial : globalCommercial,
    roleProjectsDns: openProjects.length ? openProjects : globalProjects,
    identifier,
    password,
  });

  if (openAttempt.status === 'success' || openAttempt.status === 'invalid_password') return openAttempt;

  // If both not_found or error, return whichever is more meaningful.
  if (adAttempt.status === 'error') return adAttempt;
  if (openAttempt.status === 'error') return openAttempt;
  return { status: 'not_found', provider: 'openldap' };
}
