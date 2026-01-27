import { Progress } from '@/components/ui/progress';

interface ProgressBarProps {
  value: number; // 0-1
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressBar({ value, label, showPercentage = true, className }: ProgressBarProps) {
  const percentage = Math.round(value * 100);

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <Progress value={percentage} />
      {showPercentage && (
        <p className="text-xs text-right text-muted-foreground">{percentage}%</p>
      )}
    </div>
  );
}
