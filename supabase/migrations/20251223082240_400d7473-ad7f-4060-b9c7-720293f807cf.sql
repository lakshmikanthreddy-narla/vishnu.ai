-- Make user-uploads bucket public so AI can access images
UPDATE storage.buckets SET public = true WHERE id = 'user-uploads';