import { cn } from '@/lib/utils';
import { MessageSquare, ImageIcon, Video } from 'lucide-react';

export type PlaygroundMode = 'chat' | 'image' | 'video';

interface PlaygroundModeSelectorProps {
  mode: PlaygroundMode;
  onModeChange: (mode: PlaygroundMode) => void;
}

const modes = [
  { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
  { id: 'image' as const, label: 'Image', icon: ImageIcon },
  { id: 'video' as const, label: 'Video', icon: Video },
];

export function PlaygroundModeSelector({ mode, onModeChange }: PlaygroundModeSelectorProps) {
  return (
    <div className="flex rounded-lg bg-muted p-1 gap-1">
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onModeChange(id)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
            mode === id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
