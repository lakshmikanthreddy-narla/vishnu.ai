-- Create media type enum
CREATE TYPE public.media_type AS ENUM ('image', 'video', 'upload');

-- Create media source enum
CREATE TYPE public.media_source AS ENUM ('generated', 'uploaded');

-- Create media status enum
CREATE TYPE public.media_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create media_assets table
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id UUID REFERENCES public.ai_apps(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  type media_type NOT NULL,
  source media_source NOT NULL,
  prompt TEXT,
  file_url TEXT,
  file_path TEXT,
  provider TEXT,
  status media_status NOT NULL DEFAULT 'completed',
  metadata JSONB DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  cost_estimate DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create video_jobs table for async video generation
CREATE TABLE public.video_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  status media_status NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  provider_job_id TEXT,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

-- Media assets policies
CREATE POLICY "Users can view their own media assets"
ON public.media_assets
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create media assets"
ON public.media_assets
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own media assets"
ON public.media_assets
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own media assets"
ON public.media_assets
FOR DELETE
USING (user_id = auth.uid());

-- Video jobs policies (through media_assets relationship)
CREATE POLICY "Users can view their video jobs"
ON public.video_jobs
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.media_assets
  WHERE media_assets.id = video_jobs.media_asset_id
  AND media_assets.user_id = auth.uid()
));

CREATE POLICY "Users can create video jobs"
ON public.video_jobs
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.media_assets
  WHERE media_assets.id = video_jobs.media_asset_id
  AND media_assets.user_id = auth.uid()
));

CREATE POLICY "Users can update their video jobs"
ON public.video_jobs
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.media_assets
  WHERE media_assets.id = video_jobs.media_asset_id
  AND media_assets.user_id = auth.uid()
));

-- Create updated_at triggers
CREATE TRIGGER update_media_assets_updated_at
BEFORE UPDATE ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_video_jobs_updated_at
BEFORE UPDATE ON public.video_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_media_assets_user_id ON public.media_assets(user_id);
CREATE INDEX idx_media_assets_app_id ON public.media_assets(app_id);
CREATE INDEX idx_media_assets_type ON public.media_assets(type);
CREATE INDEX idx_video_jobs_status ON public.video_jobs(status);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('user-uploads', 'user-uploads', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-images', 'generated-images', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-videos', 'generated-videos', false);

-- Storage policies for user-uploads
CREATE POLICY "Users can view their uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload to their folder"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their uploads"
ON storage.objects FOR UPDATE
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their uploads"
ON storage.objects FOR DELETE
USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for generated-images
CREATE POLICY "Users can view their generated images"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload generated images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their generated images"
ON storage.objects FOR DELETE
USING (bucket_id = 'generated-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for generated-videos
CREATE POLICY "Users can view their generated videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload generated videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their generated videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'generated-videos' AND auth.uid()::text = (storage.foldername(name))[1]);