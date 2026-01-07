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

## 1. Instalação Local (Desenvolvimento)

### 1.1 Clonar o Repositório

```bash
git clone <url-do-repositorio>
cd projeto-gestao
```

### 1.2 Instalar Dependências

```bash
npm install
```

### 1.3 Configurar Variáveis de Ambiente

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

### 1.4 Configurar Banco de Dados (Opcional)

Se desejar usar PostgreSQL ao invés de armazenamento em memória:

```bash
# Criar o banco de dados
createdb tec3_gestao

# Executar migrações (se houver)
npm run db:push
```

### 1.5 Executar o Sistema

```bash
# Modo desenvolvimento (com hot-reload)
npm run dev
```

O sistema estará disponível em: **http://localhost:5000**

### 1.6 Credenciais de Acesso Padrão

- **Email:** admin@empresa.com
- **Senha:** admin123
- **Perfil:** Proprietário (acesso total)

---

## 2. Build para Produção

### 2.1 Gerar Build

```bash
npm run build
```

### 2.2 Executar em Produção

```bash
NODE_ENV=production npm start
```

---

## 3. Deploy com Docker

### 3.1 Estrutura Docker

O projeto inclui os seguintes arquivos Docker:

- `Dockerfile` - Imagem principal da aplicação
- `docker-compose.yml` - Orquestração dos serviços

### 3.2 Dockerfile

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

### 3.3 Docker Compose

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

### 3.4 Executar com Docker

```bash
# Configurar variável de ambiente
export SESSION_SECRET=sua-chave-secreta-aqui

# Build e iniciar
docker-compose up --build -d

# Ver logs
docker-compose logs -f app
```

---

## 4. Deploy no Google Cloud Run

### 4.1 Pré-requisitos

- Conta Google Cloud com projeto criado
- Google Cloud CLI (gcloud) instalado
- Docker instalado localmente

### 4.2 Configurar Google Cloud CLI

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

### 4.3 Criar Repositório de Imagens

```bash
gcloud artifacts repositories create tec3-repo \
    --repository-format=docker \
    --location=southamerica-east1 \
    --description="Repositorio TEC3"
```

### 4.4 Build e Push da Imagem

```bash
# Configurar Docker para usar Google Cloud
gcloud auth configure-docker southamerica-east1-docker.pkg.dev

# Build da imagem
docker build -t southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest .

# Push para o registry
docker push southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest
```

### 4.5 Deploy no Cloud Run

```bash
gcloud run deploy tec3-app \
    --image southamerica-east1-docker.pkg.dev/SEU_PROJECT_ID/tec3-repo/tec3-app:latest \
    --platform managed \
    --region southamerica-east1 \
    --allow-unauthenticated \
    --port 5000 \
    --set-env-vars "NODE_ENV=production,SESSION_SECRET=sua-chave-secreta"
```

### 4.6 Configurar Banco de Dados (Cloud SQL)

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

### 4.7 Conectar Cloud Run ao Cloud SQL

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

## 5. Deploy na AWS (ECS/Fargate)

### 5.1 Pré-requisitos

- AWS CLI configurado
- Docker instalado

### 5.2 Push para ECR

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

### 5.3 Criar Task Definition

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

## 6. Perfis de Acesso

| Perfil | Descrição | Permissões |
|--------|-----------|------------|
| Owner | Proprietário | Acesso total + gestão de usuários |
| Admin | Administrador | Acesso total (exceto gestão de usuários) |
| Coordinator | Coordenador | Projetos + aprovação de horas |
| Commercial | Comercial | Propostas + clientes |
| User | Colaborador | Apenas lançamento de horas |

---

## 7. Estrutura do Projeto

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

## 8. Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento |
| `npm run build` | Gera build de produção |
| `npm start` | Inicia servidor de produção |
| `npm run db:push` | Aplica schema no banco de dados |

---

## 9. Troubleshooting

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

## 10. Suporte

Para dúvidas ou problemas, entre em contato com a equipe de desenvolvimento.

**TEC3 Engenharia**
https://www.tec3engenharia.com.br
