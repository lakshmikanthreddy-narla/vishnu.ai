import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, ImageIcon, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  createdAt: Date;
}

interface ImagePlaygroundProps {
  appId?: string;
}

const STYLE_OPTIONS = [
  { value: 'none', label: 'No style' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'artistic', label: 'Artistic' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'anime', label: 'Anime' },
  { value: 'digital-art', label: 'Digital Art' },
  { value: 'oil-painting', label: 'Oil Painting' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: '3d-render', label: '3D Render' },
];

const SIZE_OPTIONS = [
  { value: '256x256', label: '256×256' },
  { value: '512x512', label: '512×512' },
  { value: '1024x1024', label: '1024×1024' },
];

export function ImagePlayground({ appId }: ImagePlaygroundProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('none');
  const [size, setSize] = useState('1024x1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Prompt required',
        description: 'Please enter a description for your image.',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in to generate images');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            size,
            style: style === 'none' ? undefined : style,
            appId,
          }),
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
        throw new Error(errorData.error || 'Failed to generate image');
      }

      const data = await response.json();

      if (data.success && (data.imageUrl || data.base64)) {
        const newImage: GeneratedImage = {
          id: data.mediaAssetId || crypto.randomUUID(),
          url: data.base64 || data.imageUrl,
          prompt: prompt.trim(),
          createdAt: new Date(),
        };

        setGeneratedImages((prev) => [newImage, ...prev]);
        setPrompt('');

        toast({
          title: 'Image generated!',
          description: 'Your image has been created successfully.',
        });
      } else {
        throw new Error('No image returned');
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

  const handleDownload = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'Could not download the image.',
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-border bg-card space-y-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate..."
          className="min-h-[80px] resize-none"
          disabled={isGenerating}
        />

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-muted-foreground mb-1 block">Style</label>
            <Select value={style} onValueChange={setStyle} disabled={isGenerating}>
              <SelectTrigger>
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {STYLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-muted-foreground mb-1 block">Size</label>
            <Select value={size} onValueChange={setSize} disabled={isGenerating}>
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                {SIZE_OPTIONS.map((option) => (
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
                Generating...
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

      {/* Generated Images Grid */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {generatedImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <ImageIcon className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Generate Images</h2>
              <p className="text-muted-foreground max-w-md">
                Describe what you want to see and our AI will create it for you.
                Generated images will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {generatedImages.map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    'group relative rounded-xl overflow-hidden border border-border',
                    'bg-muted/50 transition-all hover:shadow-lg'
                  )}
                >
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="w-full aspect-square object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-sm line-clamp-2 mb-2">{image.prompt}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDownload(image)}
                        className="w-full"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
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
