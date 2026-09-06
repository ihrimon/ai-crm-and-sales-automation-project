import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function SampleDataBadge() {
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Sparkles className="size-3" />
      Sample data
    </Badge>
  );
}
