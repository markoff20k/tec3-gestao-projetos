import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProjectHealth, ProjectHealthLevel } from '@/lib/api';

export const healthLevelColors: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

export const healthLevelLabels: Record<string, string> = {
  green: 'Saudável',
  yellow: 'Atenção',
  red: 'Crítico',
};

function TrafficLightIcon({ level }: { level: ProjectHealthLevel }) {
  const lights: Array<{ key: ProjectHealthLevel; cx: number; color: string }> = [
    { key: 'red', cx: 8, color: '#ef4444' },
    { key: 'yellow', cx: 16, color: '#f59e0b' },
    { key: 'green', cx: 24, color: '#22c55e' },
  ];

  return (
    <svg
      width="32"
      height="16"
      viewBox="0 0 32 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="0.5" y="0.5" width="31" height="15" rx="7.5" className="fill-slate-200 dark:fill-slate-800" stroke="currentColor" strokeOpacity="0.15" />
      {lights.map((light) => {
        const isOn = light.key === level;
        return (
          <g key={light.key}>
            {isOn && <circle cx={light.cx} cy="8" r="6.4" fill={light.color} opacity="0.32" />}
            <circle
              cx={light.cx}
              cy="8"
              r={isOn ? 4.8 : 3.2}
              fill={isOn ? light.color : '#94a3b8'}
              fillOpacity={isOn ? 1 : 0.35}
              stroke={isOn ? '#ffffff' : 'none'}
              strokeWidth={isOn ? 0.9 : 0}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function ProjectHealthDot({ health }: { health?: ProjectHealth | null }) {
  if (!health) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0" data-testid="indicator-project-health">
          <TrafficLightIcon level={health.level} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium">{healthLevelLabels[health.level]}</p>
        {health.metrics.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs">
            {health.metrics.map((metric) => (
              <li key={metric.key} className="flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${healthLevelColors[metric.level]}`} />
                {metric.label}: {metric.displayValue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Nenhuma métrica habilitada</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function ProjectHealthSummary({ health }: { health?: ProjectHealth | null }) {
  if (!health) {
    return <p className="text-sm text-muted-foreground">Sem dados suficientes para calcular a saúde do projeto.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TrafficLightIcon level={health.level} />
        <span className="font-semibold">{healthLevelLabels[health.level]}</span>
        <span className="text-xs text-muted-foreground">
          ({health.ruleSource === 'project' ? 'regra personalizada deste projeto' : 'regra padrão do sistema'})
        </span>
      </div>
      {health.metrics.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {health.metrics.map((metric) => (
            <div key={metric.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${healthLevelColors[metric.level]}`} />
                {metric.label}
              </span>
              <span className="font-medium">{metric.displayValue}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhuma métrica habilitada nas regras atuais.</p>
      )}
    </div>
  );
}
