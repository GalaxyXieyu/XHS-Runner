import type { Theme } from '@/App';

export interface CreativeTabProps {
  theme: Theme;
  themes?: Theme[];
  onSelectTheme?: (themeId: string) => void;
}
