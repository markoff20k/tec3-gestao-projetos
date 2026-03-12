import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DangerZoneConfirmProps {
  title?: string;
  description: string;
  expectedValue: string;
  value: string;
  onValueChange: (value: string) => void;
  inputTestId?: string;
  inputPlaceholder?: string;
}

export function DangerZoneConfirm({
  title = 'Zona de Perigo',
  description,
  expectedValue,
  value,
  onValueChange,
  inputTestId,
  inputPlaceholder = 'Digite o código para confirmar',
}: DangerZoneConfirmProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
        <div className="space-y-2 text-sm">
          <p className="font-medium text-destructive">{title}</p>
          <p className="text-muted-foreground">{description}</p>
          <p className="font-mono text-sm text-foreground">{expectedValue}</p>
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={inputPlaceholder}
            data-testid={inputTestId}
          />
        </div>
      </div>
    </div>
  );
}
