# TEC3 Engenharia - Sistema de Gestão
## Instruções de Instalação Local

Este documento descreve como configurar e executar o sistema localmente em sua máquina.

---

## Requisitos do Sistema

- **Node.js** v18 ou superior
- **npm** v9 ou superior
- **PostgreSQL** v14 ou superior (opcional - o sistema pode usar armazenamento em memória)
- **Docker** e **Docker Compose** (para deploy containerizado)

---

## 1. Desenvolvimento no Windows com VS Code

Esta seção descreve passo a passo como configurar o ambiente de desenvolvimento no Windows usando Visual Studio Code.

### 1.1 Instalar Ferramentas Necessárias

#### Node.js
1. Acesse https://nodejs.org/
2. Baixe a versão **LTS** (recomendada)
3. Execute o instalador e siga as instruções
4. Marque a opção "Automatically install necessary tools" se disponível
5. Verifique a instalação abrindo o **Prompt de Comando** (cmd) ou **PowerShell**:
   ```cmd
   node --version
   npm --version
   ```

#### Visual Studio Code
1. Acesse https://code.visualstudio.com/
2. Baixe e instale a versão para Windows
3. Instale as extensões recomendadas (veja seção 1.3)

#### Git
1. Acesse https://git-scm.com/download/win
2. Baixe e instale o Git para Windows
3. Durante a instalação, mantenha as opções padrão
4. Verifique a instalação:
   ```cmd
   git --version
   ```

#### PostgreSQL (Opcional)
1. Acesse https://www.postgresql.org/download/windows/
2. Baixe o instalador da EnterpriseDB
3. Durante a instalação:
   - Defina a senha do usuário `postgres`
   - Mantenha a porta padrão `5432`
   - Marque a opção para instalar o pgAdmin 4
4. Verifique a instalação:
   ```cmd
   psql --version
   ```

### 1.2 Clonar o Projeto

Abra o **PowerShell** ou **Git Bash** e execute:

```powershell
# Navegue até a pasta onde deseja salvar o projeto
cd C:\Projetos

# Clone o repositório
git clone <url-do-repositorio>

# Entre na pasta do projeto
cd projeto-gestao
```

### 1.3 Configurar VS Code

#### Abrir o Projeto
1. Abra o VS Code
2. Vá em **File > Open Folder**
3. Selecione a pasta do projeto

#### Extensões Recomendadas
Instale as seguintes extensões (Ctrl+Shift+X):

| Extensão | Descrição |
|----------|-----------|
| **ESLint** | Linting de JavaScript/TypeScript |
| **Prettier** | Formatação de código |
| **TypeScript Vue Plugin (Volar)** | Suporte TypeScript |
| **Tailwind CSS IntelliSense** | Autocomplete para Tailwind |
| **PostCSS Language Support** | Suporte a PostCSS |
| **Thunder Client** | Testar APIs REST |
| **GitLens** | Integração avançada com Git |
| **Error Lens** | Exibe erros inline |
| **PostgreSQL** (cweijan) | Gerenciar banco de dados |

#### Configurações do VS Code
Crie o arquivo `.vscode/settings.json` com:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

### 1.4 Instalar Dependências

No terminal integrado do VS Code (Ctrl+`):

```powershell
npm install
```

### 1.5 Configurar Variáveis de Ambiente

1. Crie um arquivo `.env` na raiz do projeto
2. Adicione o conteúdo:

```env
# Configuração do Servidor
NODE_ENV=development
PORT=5000

# Segurança
SESSION_SECRET=minha-chave-secreta-desenvolvimento-123

# Banco de Dados PostgreSQL (opcional)
# Descomente e configure se for usar PostgreSQL
# DATABASE_URL=postgresql://postgres:sua_senha@localhost:5432/tec3_gestao
```

### 1.6 Configurar Banco de Dados (Opcional)

Se quiser usar PostgreSQL:

1. Abra o **pgAdmin 4**
2. Conecte no servidor local
3. Clique com botão direito em "Databases" > "Create" > "Database"
4. Nome: `tec3_gestao`
5. Clique em "Save"

Ou via linha de comando (PowerShell como Administrador):

```powershell
# Definir variável de ambiente temporária
$env:PGPASSWORD="sua_senha_postgres"

# Criar banco de dados
psql -U postgres -c "CREATE DATABASE tec3_gestao;"
```

### 1.7 Executar o Sistema

No terminal do VS Code:

```powershell
npm run dev
```

Aguarde a mensagem:
```
serving on port 5000
```

Acesse no navegador: **http://localhost:5000**

### 1.8 Credenciais de Teste

- **Email:** admin@empresa.com
- **Senha:** admin123
- **Perfil:** Proprietário (acesso total)

### 1.9 Comandos Úteis no Desenvolvimento

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Gera build de produção |
| `Ctrl+C` | Para o servidor |
| `Ctrl+Shift+P` | Paleta de comandos do VS Code |
| `Ctrl+`` ` | Abre/fecha terminal integrado |

### 1.10 Estrutura de Pastas no VS Code

```
projeto-gestao/
├── 📁 client/           # Frontend React
│   ├── 📁 src/
│   │   ├── 📁 components/   # Componentes UI
│   │   ├── 📁 contexts/     # Contextos (Auth, Theme)
│   │   ├── 📁 pages/        # Páginas da aplicação
│   │   └── 📁 lib/          # Utilitários
├── 📁 server/           # Backend Express
│   ├── 📄 index.ts      # Entrada do servidor
│   ├── 📄 routes.ts     # Rotas da API
│   └── 📄 storage.ts    # Camada de dados
├── 📁 shared/           # Código compartilhado
│   └── 📄 schema.ts     # Tipos e schemas
├── 📄 .env              # Variáveis de ambiente
└── 📄 package.json      # Dependências
```

### 1.11 Resolução de Problemas no Windows

#### Erro: "npm não é reconhecido"
- Reinicie o terminal após instalar o Node.js
- Verifique se Node.js está no PATH do sistema

#### Erro: "Execution Policy" no PowerShell
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Erro: "ENOENT" ou "file not found"
- Verifique se está na pasta correta do projeto
- Execute `npm install` novamente

#### Porta 5000 em uso
```powershell
# Encontrar processo usando a porta
netstat -ano | findstr :5000

# Encerrar processo (substitua PID pelo número encontrado)
taskkill /PID <PID> /F
```

#### Erro de permissão ao criar arquivos
- Execute o VS Code como Administrador
- Ou mude a pasta do projeto para dentro de `C:\Users\SeuUsuario\`

#### Hot Reload não funciona
- Salve o arquivo (Ctrl+S) para disparar o reload
- Verifique se o antivírus não está bloqueando

---

## 2. Instalação Local (Linux/Mac)

### 2.1 Clonar o Repositório

```bash
git clone <url-do-repositorio>
cd projeto-gestao
```

### 2.2 Instalar Dependências

```bash
npm install
```

### 2.3 Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Configuração do Servidor
NODE_ENV=development
PORT=5000

# Segurança (obrigatório)
SESSION_SECRET=sua-chave-secreta-aqui-minimo-32-caracteres

# Banco de Dados PostgreSQL (opcional)
DATABASE_URL=postgresql://usuario:senha@localhost:5432/tec3_gestao

# Configurações do JWT
JWT_EXPIRES_IN=24h
```

### 2.4 Configurar Banco de Dados (Opcional)

Se desejar usar PostgreSQL ao invés de armazenamento em memória:

```bash
# Criar o banco de dados
createdb tec3_gestao

# Executar migrações (se houver)
npm run db:push
```

### 2.5 Executar o Sistema

```bash
# Modo desenvolvimento (com hot-reload)
npm run dev
```

O sistema estará disponível em: **http://localhost:5000**

### 2.6 Credenciais de Acesso Padrão

- **Email:** admin@empresa.com
- **Senha:** admin123
- **Perfil:** Proprietário (acesso total)

---

## 3. Build para Produção

### 3.1 Gerar Build

```bash
npm run build
```

### 3.2 Executar em Produção

```bash
NODE_ENV=production npm start
```

---

## 4. Deploy com Docker

### 4.1 Estrutura Docker

O projeto inclui os seguintes arquivos Docker:

- `Dockerfile` - Imagem principal da aplicação
- `docker-compose.yml` - Orquestração dos serviços

### 4.2 Dockerfile

Crie o arquivo `Dockerfile` na raiz:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

EXPOSE 5000

CMD ["node", "dist/index.js"]
```

### 4.3 Docker Compose

Crie o arquivo `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - SESSION_SECRET=${SESSION_SECRET}
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/tec3_gestao
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=tec3_gestao
    restart: unless-stopped

volumes:
  postgres_data:
```

### 4.4 Executar com Docker

```bash
# Configurar variável de ambiente
export SESSION_SECRET=sua-chave-secreta-aqui

# Build e iniciar
docker-compose up --build -d

# Ver logs
docker-compose logs -f app
```

---

## 5. Deploy no Google Cloud Run

### 5.1 Pré-requisitos

- Conta Google Cloud com projeto criado
- Google Cloud CLI (gcloud) instalado
- Docker instalado localmente

### 5.2 Configurar Google Cloud CLI

```bash
# Autenticar
gcloud auth login

# Configurar projeto
gcloud config set project SEU_PROJECT_ID

# Habilitar APIs necessárias
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### 5.3 Criar Repositório de Imagens

```bash
gcloud artifacts repositories create tec3-repo \
    --repository-format=docker \
    --location=southamerica-east1 \
    --description="Repositorio TEC3"
```

### 5.4 Build e Push da Imagem

```bash
# Configurar Docker para usar Google Cloud
gcloud auth configure-docker southamerica-east1-docker.pkg.dev

# Build da imagem
docker build -t southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest .

# Push para o registry
docker push southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest
```

### 5.5 Deploy no Cloud Run

```bash
gcloud run deploy tec3-app \
    --image southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest \
    --platform managed \
    --region southamerica-east1 \
    --allow-unauthenticated \
    --port 5000 \
    --set-env-vars "NODE_ENV=production,SESSION_SECRET=sua-chave-secreta"
```

### 5.6 Configurar Banco de Dados (Cloud SQL)

Para ambiente de produção, recomenda-se usar Cloud SQL:

```bash
# Criar instância PostgreSQL
gcloud sql instances create tec3-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=southamerica-east1

# Criar banco de dados
gcloud sql databases create tec3_gestao --instance=tec3-db

# Criar usuário
gcloud sql users create tec3_user \
    --instance=tec3-db \
    --password=SUA_SENHA_SEGURA
```

### 5.7 Conectar Cloud Run ao Cloud SQL

```bash
gcloud run deploy tec3-app \
    --image southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest \
    --platform managed \
    --region southamerica-east1 \
    --allow-unauthenticated \
    --port 5000 \
    --add-cloudsql-instances SEU_PROJECT_ID:southamerica-east1:tec3-db \
    --set-env-vars "NODE_ENV=production,SESSION_SECRET=sua-chave-secreta,DATABASE_URL=postgresql://tec3_user:SUA_SENHA@/tec3_gestao?host=/cloudsql/SEU_PROJECT_ID:southamerica-east1:tec3-db"
```

---

## 6. Deploy na AWS (ECS/Fargate)

### 6.1 Pré-requisitos

- AWS CLI configurado
- Docker instalado

### 6.2 Push para ECR

```bash
# Login no ECR
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin SEU_ACCOUNT_ID.dkr.ecr.sa-east-1.amazonaws.com

# Criar repositório
aws ecr create-repository --repository-name tec3-app --region sa-east-1

# Build e push
docker build -t tec3-app .
docker tag tec3-app:latest SEU_ACCOUNT_ID.dkr.ecr.sa-east-1.amazonaws.com/tec3-app:latest
docker push SEU_ACCOUNT_ID.dkr.ecr.sa-east-1.amazonaws.com/tec3-app:latest
```

### 6.3 Criar Task Definition

Crie um arquivo `task-definition.json`:

```json
{
  "family": "tec3-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "tec3-app",
      "image": "SEU_ACCOUNT_ID.dkr.ecr.sa-east-1.amazonaws.com/tec3-app:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "5000"}
      ],
      "secrets": [
        {
          "name": "SESSION_SECRET",
          "valueFrom": "arn:aws:secretsmanager:sa-east-1:SEU_ACCOUNT_ID:secret:tec3/session-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/tec3-app",
          "awslogs-region": "sa-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

## 7. Perfis de Acesso

| Perfil | Descrição | Permissões |
|--------|-----------|------------|
| Owner | Proprietário | Acesso total + gestão de usuários |
| Admin | Administrador | Acesso total (exceto gestão de usuários) |
| Coordinator | Coordenador | Projetos + aprovação de horas |
| Commercial | Comercial | Propostas + clientes |
| User | Colaborador | Apenas lançamento de horas |

---

## 8. Estrutura do Projeto

```
/
├── client/              # Frontend React
│   ├── src/
│   │   ├── components/  # Componentes reutilizáveis
│   │   ├── contexts/    # Contextos React (Auth, Theme)
│   │   ├── pages/       # Páginas da aplicação
│   │   └── lib/         # Utilitários
├── server/              # Backend Express
│   ├── index.ts         # Entrada do servidor
│   ├── routes.ts        # Rotas da API
│   ├── storage.ts       # Camada de dados
│   └── static.ts        # Servir arquivos estáticos
├── shared/              # Código compartilhado
│   └── schema.ts        # Schemas e tipos
└── uploads/             # Arquivos enviados (fotos de perfil)
```

---

## 9. Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento |
| `npm run build` | Gera build de produção |
| `npm start` | Inicia servidor de produção |
| `npm run db:push` | Aplica schema no banco de dados |

---

## 10. Troubleshooting

### Erro: "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Erro: "ECONNREFUSED" (banco de dados)
Verifique se o PostgreSQL está rodando e as credenciais estão corretas.

### Erro: "Port 5000 already in use"
```bash
# Linux/Mac
lsof -ti:5000 | xargs kill -9

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

---

## 11. Suporte

Para dúvidas ou problemas, entre em contato com a equipe de desenvolvimento.

**TEC3 Engenharia**
https://www.tec3engenharia.com.br
