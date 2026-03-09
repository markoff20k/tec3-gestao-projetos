-- Add persistent toast position preference

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "toast_position" TEXT NOT NULL DEFAULT 'bottom-right';
