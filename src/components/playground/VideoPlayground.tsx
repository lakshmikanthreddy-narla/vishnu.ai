import { Video, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoPlaygroundProps {
  appId?: string;
}

export function VideoPlayground({ appId }: VideoPlaygroundProps) {
  return (
    <div className="flex flex-col h-full items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Video className="h-10 w-10 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Video Generation Coming Soon</h2>
          <p className="text-muted-foreground">
            This feature requires a video provider. We're working on bringing AI video generation to you soon.
          </p>
        </div>

        <Button disabled className="min-w-[160px]">
          <Sparkles className="h-4 w-4 mr-2" />
          Generate Video
        </Button>

        <p className="text-xs text-muted-foreground">
          Image generation and chat are fully available now.
        </p>
      </div>
    </div>
  );
}
