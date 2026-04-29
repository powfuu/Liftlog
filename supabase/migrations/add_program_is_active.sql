-- Add is_active flag to programs so users can disable visibility without deleting
ALTER TABLE programs
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

