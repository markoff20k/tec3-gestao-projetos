ALTER TABLE "proposal_category_values"
ALTER COLUMN "hours" TYPE DECIMAL(6, 2)
USING "hours"::DECIMAL(6, 2);