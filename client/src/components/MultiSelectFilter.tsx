import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Filtro de múltipla escolha com busca. Substitui os Selects de escolha única
 * para que todo filtro da tela se comporte igual — status e tipo já aceitavam
 * vários valores, os demais não.
 */
export function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nenhuma opção encontrada.',
  testId,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  testId?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const selectedLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((option) => option.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selecionados`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="h-10 w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
            {selectedLabel}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {selected.length > 1 ? (
              <Badge variant="secondary" className="h-5 px-1.5">
                {selected.length}
              </Badge>
            ) : null}
            {selected.length > 0 ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpar seleção"
                className="rounded p-0.5 hover:bg-muted"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange([]);
                  }
                }}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            ) : (
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'
                      )}
                    >
                      {isSelected ? <Check className="h-3 w-3" /> : null}
                    </div>
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
