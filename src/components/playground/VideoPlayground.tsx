import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, Video, Sparkles, Clock, CheckCircle2, XCircle, RefreshCw, Eye, Bug } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

interface VideoJob {
  id: string;
  providerJobId?: string;
  mediaAssetId: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  errorMessage?: string;
  seed?: number;
  createdAt: Date;
}

interface VideoPlaygroundProps {
  appId?: string;
}

const DURATION_OPTIONS = [
  { value: '5s', label: '5 seconds' },
  { value: '10s', label: '10 seconds' },
  { value: '15s', label: '15 seconds' },
];

const ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '9:16', label: '9:16 (Portrait)' },
  { value: '1:1', label: '1:1 (Square)' },
];

export function VideoPlayground({ appId }: VideoPlaygroundProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5s');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoJobs, setVideoJobs] = useState<VideoJob[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Poll for job status updates - poll by job_id only
  useEffect(() => {
    const pendingJobs = videoJobs.filter(
      (job) => job.status === 'pending' || job.status === 'processing'
    );

    if (pendingJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const job of pendingJobs) {
        try {
          // Poll by specific job ID only - do not reuse previous results
          const { data, error } = await supabase
            .from('video_jobs')
            .select('*, media_assets(*)')
            .eq('id', job.id)
            .single();

          if (error) {
            console.error('Failed to poll job:', job.id, error);
            continue;
          }

          // Validate that returned data matches current job_id
          if (data.id !== job.id) {
            console.warn('Job ID mismatch, skipping update');
            continue;
          }

          setVideoJobs((prev) =>
            prev.map((j) =>
              j.id === job.id
                ? {
                    ...j,
                    status: data.status,
                    progress: data.progress || 0,
                    videoUrl: data.media_assets?.file_url,
                    errorMessage: data.error_message,
                  }
                : j
            )
          );

          if (data.status === 'completed') {
            toast({
              title: 'Video ready!',
              description: `Job ${job.id.substring(0, 8)} completed successfully.`,
            });
          } else if (data.status === 'failed') {
            toast({
              variant: 'destructive',
              title: 'Video generation failed',
              description: data.error_message || 'An error occurred.',
            });
          }
        } catch (error) {
          console.error('Failed to poll job status:', error);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videoJobs, toast]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Prompt required',
        description: 'Please enter a description for your video.',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in to generate videos');
      }

      // Send prompt directly to edge function - no hardcoded prompts
      const requestPayload = {
        prompt: prompt.trim(),
        duration,
        aspectRatio,
        appId,
        action: 'create',
      };

      console.log('Sending video generation request:', requestPayload);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(requestPayload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 402) {
          throw new Error('Payment required. Please check your credits.');
        }
        throw new Error(errorData.error || 'Failed to start video generation');
      }

      const data = await response.json();

      if (data.success) {
        // Create new job with unique IDs - never reuse job IDs
        const newJob: VideoJob = {
          id: data.jobId,
          providerJobId: data.providerJobId,
          mediaAssetId: data.mediaAssetId,
          prompt: prompt.trim(),
          status: 'pending',
          progress: 0,
          seed: data.seed,
          createdAt: new Date(),
        };

        // Add to list - each generation creates a new job
        setVideoJobs((prev) => [newJob, ...prev]);
        setPrompt('');
        setShowPreview(false);

        toast({
          title: 'Video generation started',
          description: debugMode 
            ? `Job ID: ${data.jobId.substring(0, 8)} | Seed: ${data.seed}`
            : 'This may take a few minutes.',
        });
      } else {
        throw new Error('Failed to create video job');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: error.message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (job: VideoJob) => {
    if (!job.videoUrl) return;

    try {
      const response = await fetch(job.videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${job.id.substring(0, 8)}-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'Could not download the video.',
      });
    }
  };

  const getStatusIcon = (status: VideoJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (status: VideoJob['status']) => {
    switch (status) {
      case 'pending':
        return 'Queued';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Ready';
      case 'failed':
        return 'Failed';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Debug Mode</span>
            <Switch checked={debugMode} onCheckedChange={setDebugMode} />
          </div>
          {prompt.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs"
            >
              <Eye className="h-3 w-3 mr-1" />
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
          )}
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to generate..."
          className="min-h-[80px] resize-none"
          disabled={isGenerating}
        />

        {/* Prompt Preview */}
        {showPreview && prompt.trim() && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Prompt Preview:</p>
            <p className="text-sm">{prompt.trim()}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[130px]">
            <label className="text-xs text-muted-foreground mb-1 block">Duration</label>
            <Select value={duration} onValueChange={setDuration} disabled={isGenerating}>
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-muted-foreground mb-1 block">Aspect Ratio</label>
            <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={isGenerating}>
              <SelectTrigger>
                <SelectValue placeholder="Select ratio" />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="min-w-[120px]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Video Jobs List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {videoJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Video className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Generate Videos</h2>
              <p className="text-muted-foreground max-w-md">
                Describe what you want to see and our AI will create a video for you.
                Video generation may take a few minutes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {videoJobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    'rounded-xl border border-border bg-card p-4',
                    'transition-all hover:shadow-md'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Video Preview / Placeholder */}
                    <div className="w-40 aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {job.status === 'completed' && job.videoUrl ? (
                        <video
                          src={job.videoUrl}
                          controls
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Video className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>

                    {/* Job Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2 mb-2">{job.prompt}</p>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        {getStatusIcon(job.status)}
                        <span>{getStatusText(job.status)}</span>
                        {job.status === 'processing' && (
                          <span className="text-primary">{job.progress}%</span>
                        )}
                      </div>

                      {/* Debug Info */}
                      {debugMode && (
                        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mb-2 font-mono">
                          <p>Job ID: {job.id}</p>
                          {job.providerJobId && <p>Provider ID: {job.providerJobId}</p>}
                          {job.seed && <p>Seed: {job.seed}</p>}
                        </div>
                      )}

                      {(job.status === 'pending' || job.status === 'processing') && (
                        <Progress value={job.progress} className="h-1.5" />
                      )}

                      {job.status === 'failed' && job.errorMessage && (
                        <p className="text-xs text-destructive">{job.errorMessage}</p>
                      )}

                      {job.status === 'completed' && job.videoUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(job)}
                          className="mt-2"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
