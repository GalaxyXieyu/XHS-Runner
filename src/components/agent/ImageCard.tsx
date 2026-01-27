import { Image as ImageIcon, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

interface ImageCardProps {
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress?: number;
  url?: string;
  errorMessage?: string;
  prompt?: string;
  className?: string;
}

export function ImageCard({
  status,
  progress = 0,
  url,
  errorMessage,
  prompt,
  className
}: ImageCardProps) {
  return (
    <div className={`border rounded-lg p-4 space-y-2 ${className || ''}`}>
      {status === 'complete' && url ? (
        <img src={url} alt="Generated" className="w-full rounded" />
      ) : (
        <div className="aspect-square bg-muted rounded flex items-center justify-center">
          {status === 'queued' && <ImageIcon className="w-12 h-12 text-muted-foreground" />}
          {status === 'generating' && <Loader2 className="w-12 h-12 animate-spin text-primary" />}
          {status === 'failed' && <XCircle className="w-12 h-12 text-destructive" />}
        </div>
      )}

      {status === 'generating' && (
        <ProgressBar value={progress} showPercentage />
      )}

      {status === 'complete' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span>生成完成</span>
        </div>
      )}

      {status === 'failed' && errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      {prompt && (
        <p className="text-xs text-muted-foreground line-clamp-2">{prompt}</p>
      )}
    </div>
  );
}
