-- Fix 1: Make user-uploads bucket private
UPDATE storage.buckets SET public = false WHERE id = 'user-uploads';

-- Fix 2: Add RLS policy for storage.objects to allow authenticated users to access their files
CREATE POLICY "Users can access their own uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Note: existing INSERT/UPDATE/DELETE policies should remain as-is