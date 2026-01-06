# Enterprise Project & Commercial Management System

## Overview
Sistema de gestão de projetos e propostas comerciais corporativo desenvolvido com:
- **Backend**: NestJS + TypeORM + PostgreSQL
- **Frontend**: React + TypeScript + TailwindCSS + shadcn/ui
- **Autenticação**: JWT (preparado para futura integração LDAP)
- **Deploy**: Docker + Docker Compose (AWS-ready)

## Estrutura do Projeto

```
/
├── backend/           # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/         # Autenticação JWT + RBAC
│   │   │   ├── commercial/   # Clientes, Propostas, Revisões
│   │   │   ├── projects/     # Projetos, Lançamento de Horas
│   │   │   └── reports/      # Dashboard e Relatórios
│   │   └── common/           # Guards, Decorators
│   ├── Dockerfile
│   └── package.json
├── frontend/          # React SPA (para Docker)
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── client/            # React SPA (dev environment)
│   ├── src/
│   │   ├── contexts/     # AuthContext
│   │   ├── pages/        # Dashboard, Clients, Proposals, Projects
│   │   └── components/   # UI components
├── docker-compose.yml
└── design_guidelines.md
```

## Perfis de Acesso (5 níveis)
1. **Owner** - Acesso total + gestão de usuários
2. **Admin** - Acesso total (exceto gestão de usuários)
3. **Coordinator** - Projetos + aprovação de horas
4. **Commercial** - Propostas + clientes
5. **User** - Apenas lançamento de horas

## Funcionalidades Principais

### Módulo Comercial
- Cadastro de clientes
- Propostas com tipos: Preço Fixo, Apropriação, Guarda-Chuva, Ordem de Serviço, Aditivo
- Sistema de revisões incrementais
- Workflow: Rascunho → Em Revisão → Enviada → Negociação → Aprovada → Convertida
- Conversão de proposta em projeto

### Módulo de Projetos
- Gestão de projetos com orçamento de horas e valor
- Alocação de colaboradores
- Lançamento de horas com validação de limite diário
- Workflow de aprovação de horas

### Relatórios
- Dashboard com métricas principais
- Relatório de horas por período/projeto/colaborador
- Relatório de propostas por status/tipo
- Relatório de projetos com progresso
- Relatório de clientes com taxa de conversão

## Configuração para Desenvolvimento

### Variáveis de Ambiente
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/project_management
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
```

### Execução Local
```bash
# Backend
cd backend && npm install && npm run start:dev

# Frontend (dev)
cd client && npm install && npm run dev
```

### Docker
```bash
docker-compose up --build
```

## Padrões de Código
- Backend: NestJS modules com services separados
- Frontend: React Query para estado do servidor
- Autenticação: JWT Bearer token em localStorage
- Formato de código de proposta: PROP-YYYY-####
- Formato de código de projeto: PROJ-YYYY-####

## Recent Changes
- 2026-01-06: Estrutura inicial NestJS + React criada
- 2026-01-06: Módulos Auth, Commercial, Projects, Reports implementados
- 2026-01-06: Frontend com Dashboard, Clientes, Propostas, Projetos, Lançamento de Horas

## User Preferences
- Interface em Português (pt-BR)
- Design system: Material Design 3
- Tema: Claro com suporte a modo escuro
