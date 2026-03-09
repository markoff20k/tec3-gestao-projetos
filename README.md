# TEC3 Engenharia - Sistema de Gestão de Projetos e Propostas Comerciais

Sistema corporativo para gestão de projetos e propostas comerciais desenvolvido para a TEC3 Engenharia.

## Tecnologias Utilizadas

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Banco de Dados**: PostgreSQL + Prisma ORM
- **Autenticação**: JWT (JSON Web Tokens)
- **Deploy**: Docker + Docker Compose (AWS-ready)

## Requisitos do Sistema

### Para rodar com Docker (Recomendado)
- Docker 20.10+
- Docker Compose 2.0+

### Para rodar sem Docker
- Node.js 18+ (recomendado 20+)
- PostgreSQL 14+
- npm ou yarn

## Instalação e Execução

### Opção 1: Com Docker (Recomendado)

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd tec3-system

# 2. Copie o arquivo de ambiente
cp .env.example .env

# 3. Edite o .env com suas configurações (opcional para Docker)

# 4. Execute com Docker Compose
docker-compose up --build

# O sistema estará disponível em http://localhost:5000
```

### Opção 2: Sem Docker (Desenvolvimento Local)

> **IMPORTANTE**: Este é um projeto **monorepo**. Frontend e backend rodam juntos a partir da **raiz do projeto**. 
> NÃO tente rodar `npm run dev` dentro da pasta `client/` - isso não funcionará porque as configurações (postcss, tailwind, vite) estão na raiz.

#### 1. Instale as dependências (NA RAIZ DO PROJETO)

```bash
# Certifique-se de estar na raiz do projeto, NÃO dentro de client/
cd tec3-system  # pasta raiz
npm install
```

#### 2. Configure o banco de dados PostgreSQL

Crie um banco de dados PostgreSQL:

```sql
CREATE DATABASE tec3_system;
```

#### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Banco de Dados
DATABASE_URL=postgresql://usuario:senha@localhost:5432/tec3_system

# Autenticação JWT
JWT_SECRET=sua-chave-secreta-muito-segura-aqui-min-32-caracteres
JWT_EXPIRES_IN=24h

# Sessão
SESSION_SECRET=outra-chave-secreta-para-sessao-min-32-caracteres

# Ambiente
NODE_ENV=development
PORT=5000
```

#### 4. Execute as migrações do banco de dados

```bash
# Gerar cliente Prisma
npx prisma generate

# Executar migrações
npx prisma migrate deploy
```

Ao iniciar o servidor (`npm run dev`), o sistema faz uma inicialização automática do banco criando:
- Usuário admin padrão (`admin@empresa.com` / `admin123`) se não existir
- Categorias de proposta (tabela `proposal_categories`) se estiver vazia
- Atividades iniciais do usuário (tabela `user_activities`) quando aplicável

#### 5. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

O sistema estará disponível em **http://localhost:5000**

## Credenciais Padrão

Após a instalação, use estas credenciais para acessar:

| Usuário | Email | Senha | Perfil |
|---------|-------|-------|--------|
| Administrador | admin@empresa.com | admin123 | Owner |

## Estrutura do Projeto (Monorepo)

> **Nota**: Este é um projeto monorepo. Todos os comandos devem ser executados na **raiz do projeto**.

```
/                           # RAIZ - Execute npm run dev AQUI
├── client/                 # Frontend React (não tem package.json próprio)
│   ├── src/
│   │   ├── components/     # Componentes reutilizáveis
│   │   ├── contexts/       # Contextos React (Auth, etc)
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilitários e API
│   │   └── pages/          # Páginas da aplicação
│   └── index.html
├── server/                 # Backend Express
│   ├── routes.ts           # Rotas da API
│   ├── storage.ts          # Camada de persistência
│   └── index.ts            # Entry point
├── shared/                 # Código compartilhado
│   └── schema.ts           # Schemas e tipos
├── prisma/                 # Configuração Prisma
│   ├── schema.prisma       # Schema do banco
│   └── migrations/         # Migrações
├── postcss.config.js       # Config PostCSS (na raiz!)
├── tailwind.config.ts      # Config Tailwind (na raiz!)
├── vite.config.ts          # Config Vite (na raiz!)
├── package.json            # Dependências (na raiz!)
├── docker-compose.yml      # Configuração Docker
└── Dockerfile              # Build da aplicação
```

## Perfis de Acesso (RBAC)

O sistema possui 5 níveis de acesso:

| Perfil | Permissões |
|--------|------------|
| **Owner** | Acesso total + gestão de usuários |
| **Admin** | Acesso total (exceto gestão de usuários) |
| **Coordinator** | Projetos + aprovação de horas |
| **Commercial** | Propostas + clientes |
| **User** | Apenas lançamento de horas |

## Módulos do Sistema

### Módulo Comercial
- Cadastro de clientes
- Gestão de propostas com tipos: Preço Fixo, Apropriação, Guarda-Chuva, Ordem de Serviço, Aditivo
- Sistema de revisões incrementais
- Workflow: Rascunho → Em Revisão → Enviada → Negociação → Aprovada → Convertida
- Conversão de proposta em projeto

### Módulo de Projetos
- Gestão de projetos com orçamento de horas e valor
- Alocação de colaboradores
- Lançamento de horas com validação de limite diário
- Workflow de aprovação de horas

### Relatórios e Dashboard
- Dashboard com métricas principais
- Relatório de horas por período/projeto/colaborador
- Relatório de propostas por status/tipo
- Relatório de projetos com progresso
- Relatório de clientes com taxa de conversão

## API Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro (admin only)
- `GET /api/auth/me` - Dados do usuário logado

### Clientes
- `GET /api/clients` - Listar clientes
- `POST /api/clients` - Criar cliente
- `PUT /api/clients/:id` - Atualizar cliente
- `DELETE /api/clients/:id` - Excluir cliente

### Propostas
- `GET /api/proposals` - Listar propostas
- `POST /api/proposals` - Criar proposta
- `PUT /api/proposals/:id` - Atualizar proposta
- `DELETE /api/proposals/:id` - Excluir proposta
- `POST /api/proposals/:id/convert` - Converter em projeto

### Projetos
- `GET /api/projects` - Listar projetos
- `POST /api/projects` - Criar projeto
- `PUT /api/projects/:id` - Atualizar projeto

### Lançamento de Horas
- `GET /api/time-entries` - Listar lançamentos
- `POST /api/time-entries` - Criar lançamento
- `PUT /api/time-entries/:id` - Atualizar lançamento
- `POST /api/time-entries/:id/approve` - Aprovar lançamento

## Scripts de Linkagem (Projetos)

Use estes comandos na raiz do projeto para completar vínculos de dados legados:

```bash
# 1) Vincular usuários legados nos lançamentos de horas (dry-run)
npm run link:time-entries:users -- --dry-run

# 2) Aplicar vínculo de usuários (cria usuários legados quando necessário)
npm run link:time-entries:users

# 3) Vincular coordenadores nos projetos (dry-run)
npm run link:project:coordinators -- --dry-run

# 4) Aplicar vínculo de coordenadores
npm run link:project:coordinators
```

Mapeamento manual opcional de usuários legados:

```bash
# Gera template se houver logins não resolvidos automaticamente
npm run link:time-entries:users -- --dry-run --no-create-users

# Preencha o CSV gerado (legacyLogin;userId) e rode:
npm run link:time-entries:users -- --mapping-file=scripts/legacy-time-entry-user-mapping.template.csv --no-create-users
```

## Deploy em Produção

### AWS com Docker

1. Configure uma instância EC2 com Docker
2. Clone o repositório
3. Configure as variáveis de ambiente de produção
4. Execute:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Variáveis de Ambiente para Produção

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=chave-muito-segura-producao
SESSION_SECRET=outra-chave-segura-producao
```

### DigitalOcean (Droplet) com Docker + Nginx + Postgres

Este repositório já inclui um stack de produção pronto em `docker-compose.prod.yml` com:

- `app` (Node/Express + frontend estático)
- `db` (PostgreSQL com volume persistente)
- `nginx` (reverse proxy, portas 80/443)

#### 1) Preparar o Droplet

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo $ID)/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
	"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo $ID) \
	$(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
	sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

# validação
docker --version
docker compose version
```

Opcional (firewall básico):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

#### 2) Clonar o projeto e configurar variáveis

```bash
git clone <url-do-repositorio>
cd tec3-gestao-projetos
cp .env.prod.example .env.prod
```

Edite `.env.prod` e preencha ao menos:

- `POSTGRES_PASSWORD`
- `SESSION_SECRET`
- `APP_STARTUP_SEED_MODE` (`off` para manter snapshot exato do banco)
- variáveis LDAP/AD, se for usar autenticação corporativa

#### 2.1) (Recomendado) Seed exato do banco atual (snapshot completo)

Para subir o sistema com o **estado idêntico** ao banco atual, faça dump do banco atual e restaure no banco novo.

No ambiente atual (origem), gere o dump:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file=tec3-current.dump
```

Copie o arquivo `tec3-current.dump` para o Droplet (mesma pasta do projeto).

No Droplet, antes de subir a aplicação:

```bash
# sobe apenas o Postgres
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d db

# carrega variáveis do .env.prod na sessão atual
set -a
. ./.env.prod
set +a

# restaura o snapshot completo no banco de produção
cat tec3-current.dump | docker exec -i tec3-db-prod pg_restore \
	-U "$POSTGRES_USER" -d "$POSTGRES_DB" \
	--clean --if-exists --no-owner --no-privileges
```

Em `.env.prod`, mantenha:

```env
APP_STARTUP_SEED_MODE=off
```

Assim o backend não aplica seed mínimo no startup e preserva o snapshot como fonte da verdade.

#### 3) Subir containers

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

#### 4) Validar

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f app
```

A aplicação ficará acessível em `http://SEU_IP_DO_DROPLET`.

#### 5) Atualizar aplicação (novos deploys)

```bash
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

#### Observações importantes

- O Postgres **não** é exposto para a internet nesse stack.
- Dados persistem nos volumes Docker (`tec3_postgres_data` e `tec3_uploads_data`).
- Migrações Prisma são aplicadas automaticamente no start do container `app`.
- Para HTTPS em domínio próprio, mantenha este Nginx como reverse proxy e adicione certificado (Let's Encrypt/Certbot ou proxy externo).

## Troubleshooting

### Erro de conexão com banco de dados
- Verifique se o PostgreSQL está rodando
- Confirme as credenciais no DATABASE_URL
- Verifique se o banco foi criado

### Erro de migração
```bash
npx prisma migrate reset  # CUIDADO: apaga todos os dados
npx prisma migrate deploy
```

### Limpar cache do Prisma
```bash
npx prisma generate
```

### Porta 5000 em uso
```bash
# Linux/Mac
lsof -i :5000
kill -9 <PID>

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Inicia servidor de produção |
| `npx prisma studio` | Abre interface visual do banco |
| `npx prisma migrate dev` | Cria nova migração |
| (automático no startup) | Cria admin padrão + categorias + atividades iniciais (quando aplicável) |

## Suporte

Para dúvidas ou problemas, entre em contato com a equipe de desenvolvimento.

---

Desenvolvido para **TEC3 Engenharia** - 2026
