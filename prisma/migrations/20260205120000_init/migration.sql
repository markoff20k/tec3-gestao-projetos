-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "photo_url" TEXT,
    "photo_data" BYTEA,
    "photo_mime_type" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "sidebar_collapsed" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "proposal_columns" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "pais" TEXT,
    "cep" TEXT,
    "rua" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "nome_comercial" TEXT,
    "email_comercial" TEXT,
    "telefone_comercial" TEXT,
    "nome_medicao" TEXT,
    "email_medicao" TEXT,
    "telefone_medicao" TEXT,
    "nome_tecnico" TEXT,
    "email_tecnico" TEXT,
    "telefone_tecnico" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "client_id" TEXT NOT NULL,
    "coordinator_id" TEXT,
    "coordinator_name" TEXT,
    "type" TEXT NOT NULL DEFAULT 'fixed_price',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_hours" INTEGER NOT NULL DEFAULT 0,
    "expected_start_date" DATE,
    "expected_end_date" DATE,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "sent_date" DATE,
    "activity_type" TEXT,
    "umbrella_ref" TEXT,
    "utility" TEXT,
    "sent_by_name" TEXT,
    "specialist" TEXT,
    "main_type" TEXT,
    "quantity" INTEGER DEFAULT 0,
    "hour_justification" DECIMAL(10,2),
    "rehabilitation" DECIMAL(10,2) DEFAULT 0,
    "subcontracted" DECIMAL(10,2) DEFAULT 0,
    "payment_book" DECIMAL(10,2) DEFAULT 0,
    "expense" DECIMAL(10,2) DEFAULT 0,
    "additive_value" DECIMAL(10,2) DEFAULT 0,
    "resource" DECIMAL(10,2) DEFAULT 0,
    "work_orders" TEXT,
    "contract_code" TEXT,
    "delivery_date" DATE,
    "due_date" DATE,
    "duration" TEXT,
    "expectation" TEXT,
    "term_months" INTEGER,
    "hours" INTEGER,
    "risk_assessment" TEXT,
    "maintenance_num" INTEGER,
    "acquisition_margin" TEXT,
    "anfibex" TEXT,
    "discount" TEXT,
    "proposal_origin" TEXT,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "client_id" TEXT NOT NULL,
    "coordinator_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "start_date" DATE,
    "end_date" DATE,
    "budget_hours" INTEGER NOT NULL DEFAULT 0,
    "budget_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "daily_limit_hours" INTEGER NOT NULL DEFAULT 8,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "collaborator_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_category_values" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "category_id" TEXT,
    "custom_name" TEXT,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hours" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "proposal_category_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_code_key" ON "proposals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_categories_code_key" ON "proposal_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_favorites_user_id_proposal_id_key" ON "proposal_favorites"("user_id", "proposal_id");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_category_values" ADD CONSTRAINT "proposal_category_values_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_category_values" ADD CONSTRAINT "proposal_category_values_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "proposal_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
