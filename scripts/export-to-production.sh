#!/bin/bash
# Script para exportar dados de DEV e importar em PRODUÇÃO

echo "=== EXPORTANDO DADOS DE DESENVOLVIMENTO ==="

# Exportar clientes
echo "Exportando clientes..."
psql "$DATABASE_URL" -t -A -c "
SELECT 'INSERT INTO clients (id, cnpj, razao_social, nome_fantasia, pais, cep, rua, numero, complemento, bairro, cidade, estado, nome_comercial, email_comercial, telefone_comercial, nome_medicao, email_medicao, telefone_medicao, nome_tecnico, email_tecnico, telefone_tecnico, is_active) VALUES (' ||
  quote_literal(id) || ', ' ||
  COALESCE(quote_literal(cnpj), 'NULL') || ', ' ||
  quote_literal(razao_social) || ', ' ||
  COALESCE(quote_literal(nome_fantasia), 'NULL') || ', ' ||
  COALESCE(quote_literal(pais), 'NULL') || ', ' ||
  COALESCE(quote_literal(cep), 'NULL') || ', ' ||
  COALESCE(quote_literal(rua), 'NULL') || ', ' ||
  COALESCE(quote_literal(numero), 'NULL') || ', ' ||
  COALESCE(quote_literal(complemento), 'NULL') || ', ' ||
  COALESCE(quote_literal(bairro), 'NULL') || ', ' ||
  COALESCE(quote_literal(cidade), 'NULL') || ', ' ||
  COALESCE(quote_literal(estado), 'NULL') || ', ' ||
  COALESCE(quote_literal(nome_comercial), 'NULL') || ', ' ||
  COALESCE(quote_literal(email_comercial), 'NULL') || ', ' ||
  COALESCE(quote_literal(telefone_comercial), 'NULL') || ', ' ||
  COALESCE(quote_literal(nome_medicao), 'NULL') || ', ' ||
  COALESCE(quote_literal(email_medicao), 'NULL') || ', ' ||
  COALESCE(quote_literal(telefone_medicao), 'NULL') || ', ' ||
  COALESCE(quote_literal(nome_tecnico), 'NULL') || ', ' ||
  COALESCE(quote_literal(email_tecnico), 'NULL') || ', ' ||
  COALESCE(quote_literal(telefone_tecnico), 'NULL') || ', ' ||
  is_active || ') ON CONFLICT (id) DO NOTHING;'
FROM clients;
" > scripts/production-clients.sql

echo "Clientes exportados: $(wc -l < scripts/production-clients.sql) registros"

# Exportar propostas
echo "Exportando propostas..."
psql "$DATABASE_URL" -t -A -c "
SELECT 'INSERT INTO proposals (id, code, revision, title, description, client_id, coordinator_id, coordinator_name, type, status, total_value, estimated_hours, expected_start_date, expected_end_date, project_id, created_at, sent_date) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(code) || ', ' ||
  revision || ', ' ||
  quote_literal(title) || ', ' ||
  COALESCE(quote_literal(description), 'NULL') || ', ' ||
  quote_literal(client_id) || ', ' ||
  COALESCE(quote_literal(coordinator_id), 'NULL') || ', ' ||
  COALESCE(quote_literal(coordinator_name), 'NULL') || ', ' ||
  quote_literal(type) || ', ' ||
  quote_literal(status) || ', ' ||
  total_value || ', ' ||
  estimated_hours || ', ' ||
  COALESCE(quote_literal(expected_start_date::text), 'NULL') || ', ' ||
  COALESCE(quote_literal(expected_end_date::text), 'NULL') || ', ' ||
  COALESCE(quote_literal(project_id), 'NULL') || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  COALESCE(quote_literal(sent_date::text), 'NULL') || ') ON CONFLICT (id) DO NOTHING;'
FROM proposals;
" > scripts/production-proposals.sql

echo "Propostas exportadas: $(wc -l < scripts/production-proposals.sql) registros"

echo ""
echo "=== ARQUIVOS GERADOS ==="
echo "scripts/production-clients.sql"
echo "scripts/production-proposals.sql"
echo ""
echo "=== PARA IMPORTAR EM PRODUÇÃO, EXECUTE: ==="
echo 'psql "$DATABASE_URL_PRODUCTION" -f scripts/production-clients.sql'
echo 'psql "$DATABASE_URL_PRODUCTION" -f scripts/production-proposals.sql'
