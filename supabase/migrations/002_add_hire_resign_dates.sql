-- Add hire_date and resign_date columns to teachers table if they do not exist
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS resign_date DATE;

-- Update all existing teachers with the specified default dates
UPDATE public.teachers 
SET hire_date = '2026-02-01', 
    resign_date = '2026-11-30';
