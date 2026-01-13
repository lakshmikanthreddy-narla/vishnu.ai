-- Add two-step verification fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS two_step_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS two_step_pin_hash TEXT,
ADD COLUMN IF NOT EXISTS pin_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS two_step_recovery_email TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_two_step_enabled ON public.profiles(two_step_enabled);

-- Update RLS policies to allow users to update their own two-step fields
CREATE POLICY "Users can update their own two-step settings"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);