import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProjectHealthRuleInput } from '@/lib/api';

type MetricFieldProps = {
  label: string;
  unit: string;
  enabled: boolean;
  yellow: number;
  red: number;
  onChange: (next: { enabled: boolean; yellow: number; red: number }) => void;
  testIdPrefix: string;
};

function HealthRuleMetricFields({ label, unit, enabled, yellow, red, onChange, testIdPrefix }: MetricFieldProps) {
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{label}</Label>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked, yellow, red })}
          data-testid={`switch-${testIdPrefix}-enabled`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Alerta (amarelo) {unit}</Label>
          <Input
            type="number"
            min={0}
            value={yellow}
            disabled={!enabled}
            onChange={(event) => onChange({ enabled, yellow: Number(event.target.value) || 0, red })}
            data-testid={`input-${testIdPrefix}-yellow`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Crítico (vermelho) {unit}</Label>
          <Input
            type="number"
            min={0}
            value={red}
            disabled={!enabled}
            onChange={(event) => onChange({ enabled, yellow, red: Number(event.target.value) || 0 })}
            data-testid={`input-${testIdPrefix}-red`}
          />
        </div>
      </div>
    </div>
  );
}

export function ProjectHealthRuleForm({
  value,
  onChange,
}: {
  value: ProjectHealthRuleInput;
  onChange: (value: ProjectHealthRuleInput) => void;
}) {
  return (
    <div className="space-y-3">
      <HealthRuleMetricFields
        label="Consumo de horas"
        unit="(% do orçado)"
        enabled={value.hoursEnabled}
        yellow={value.hoursYellow}
        red={value.hoursRed}
        onChange={({ enabled, yellow, red }) =>
          onChange({ ...value, hoursEnabled: enabled, hoursYellow: yellow, hoursRed: red })
        }
        testIdPrefix="health-hours"
      />
      <HealthRuleMetricFields
        label="Desvio financeiro (EAC)"
        unit="(% do valor orçado)"
        enabled={value.financialEnabled}
        yellow={value.financialYellow}
        red={value.financialRed}
        onChange={({ enabled, yellow, red }) =>
          onChange({ ...value, financialEnabled: enabled, financialYellow: yellow, financialRed: red })
        }
        testIdPrefix="health-financial"
      />
      <HealthRuleMetricFields
        label="Horas pendentes de aprovação"
        unit="(horas)"
        enabled={value.pendingHoursEnabled}
        yellow={value.pendingHoursYellow}
        red={value.pendingHoursRed}
        onChange={({ enabled, yellow, red }) =>
          onChange({ ...value, pendingHoursEnabled: enabled, pendingHoursYellow: yellow, pendingHoursRed: red })
        }
        testIdPrefix="health-pending-hours"
      />
      <HealthRuleMetricFields
        label="Atraso de prazo"
        unit="(dias após o encerramento previsto)"
        enabled={value.scheduleEnabled}
        yellow={value.scheduleYellowDays}
        red={value.scheduleRedDays}
        onChange={({ enabled, yellow, red }) =>
          onChange({ ...value, scheduleEnabled: enabled, scheduleYellowDays: yellow, scheduleRedDays: red })
        }
        testIdPrefix="health-schedule"
      />
    </div>
  );
}
