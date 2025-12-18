import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  path: string;
}

interface FileUploaderProps {
  onFilesUploaded?: (files: UploadedFile[]) => void;
  maxFiles?: number;
  accept?: string;
  className?: string;
}

export function FileUploader({
  onFilesUploaded,
  maxFiles = 5,
  accept = 'image/png,image/jpeg,image/jpg,image/webp',
  className,
}: FileUploaderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File): Promise<UploadedFile | null> => {
    if (!user) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('user-uploads')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload ${file.name}`);
    }

    const { data: urlData } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(fileName);

    // Also save to media_assets
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        user_id: user.id,
        type: 'upload',
        source: 'uploaded',
        file_url: urlData.publicUrl,
        file_path: fileName,
        status: 'completed',
        metadata: { originalName: file.name, size: file.size, type: file.type },
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
    }

    return {
      id: mediaAsset?.id || crypto.randomUUID(),
      name: file.name,
      url: urlData.publicUrl,
      path: fileName,
    };
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter((file) => {
      const isValidType = accept.split(',').some((type) => file.type.match(type.trim()));
      if (!isValidType) {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: `${file.name} is not a supported file type.`,
        });
        return false;
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: `${file.name} exceeds the 10MB limit.`,
        });
        return false;
      }

      return true;
    });

    if (uploadedFiles.length + validFiles.length > maxFiles) {
      toast({
        variant: 'destructive',
        title: 'Too many files',
        description: `You can only upload up to ${maxFiles} files.`,
      });
      return;
    }

    setIsUploading(true);

    try {
      const results: UploadedFile[] = [];

      for (const file of validFiles) {
        const uploaded = await uploadFile(file);
        if (uploaded) {
          results.push(uploaded);
        }
      }

      setUploadedFiles((prev) => [...prev, ...results]);
      onFilesUploaded?.(results);

      toast({
        title: 'Files uploaded',
        description: `${results.length} file(s) uploaded successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [uploadedFiles.length]
  );

  const handleRemove = async (file: UploadedFile) => {
    try {
      await supabase.storage.from('user-uploads').remove([file.path]);

      setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));

      toast({
        title: 'File removed',
        description: `${file.name} has been deleted.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Remove failed',
        description: 'Could not remove the file.',
      });
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          isUploading && 'pointer-events-none opacity-50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop files here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, JPEG, WebP • Max 10MB
            </p>
          </div>
        )}
      </div>

      {/* Uploaded Files Preview */}
      {uploadedFiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="group relative rounded-lg overflow-hidden border border-border bg-muted"
            >
              <img
                src={file.url}
                alt={file.name}
                className="w-full aspect-square object-cover"
              />
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(file);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <p className="text-xs text-white truncate">{file.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
