import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eraser, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  proposalAdditivesApi,
  proposalCategoriesApi,
  type AdditiveCategoryBalance,
  type AdditiveCategoryBalanceRow,
  type ProposalAdditiveCategoryLineInput,
  type ProposalAdditiveItem,
} from '@/lib/api';

const CUSTOM_CATEGORY = '__custom__';

export interface EditableAdditiveLine {
  localId: string;
  categoryId: string | null;
  customName: string;
  hoursDelta: string;
  hourlyValue: string;
}

let localIdSeq = 0;
export const emptyAdditiveLine = (): EditableAdditiveLine => ({
  localId: `line-${Date.now()}-${localIdSeq++}`,
  categoryId: null,
  customName: '',
  hoursDelta: '',
  hourlyValue: '',
});

export const additiveLinesFromItem = (item: ProposalAdditiveItem): EditableAdditiveLine[] =>
  (item.categoryLines ?? []).map((l) => ({
    localId: l.id,
    categoryId: l.categoryId ?? null,
    customName: l.customName ?? '',
    hoursDelta: formatHours(Number(l.hoursDelta)),
    hourlyValue: formatDecimal(Number(l.hourlyValue)),
  }));

/** Aceita "10", "-10", "1,5", "-1.5". */
export function parseSignedDecimal(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function formatHours(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDecimal(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const formatCurrencySigned = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'exceptZero' });

export function additiveLinesToPayload(
  lines: EditableAdditiveLine[]
): { lines: ProposalAdditiveCategoryLineInput[]; error: string | null } {
  const out: ProposalAdditiveCategoryLineInput[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const categoryId = line.categoryId;
    const customName = line.customName.trim();
    if (!categoryId && !customName) return { lines: [], error: 'Informe a categoria de cada linha.' };
    const hoursDelta = parseSignedDecimal(line.hoursDelta);
    if (hoursDelta === null || hoursDelta === 0) {
      return { lines: [], error: 'Informe as horas (positivas ou negativas) de cada categoria.' };
    }
    const hourlyValue = parseSignedDecimal(line.hourlyValue);
    if (hourlyValue === null || hourlyValue < 0) return { lines: [], error: 'Informe um preço-hora válido.' };
    const key = categoryId ? `id:${categoryId}` : `custom:${customName.toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) return { lines: [], error: 'Categoria repetida no mesmo aditivo.' };
    seen.add(key);
    out.push({ categoryId, customName: categoryId ? null : customName, hoursDelta, hourlyValue });
  }
  return { lines: out, error: null };
}

export const additiveLinesSignature = (lines: EditableAdditiveLine[]): string =>
  JSON.stringify(
    lines.map((l) => [l.categoryId, l.customName.trim().toLocaleLowerCase('pt-BR'), parseSignedDecimal(l.hoursDelta), parseSignedDecimal(l.hourlyValue)])
  );

export const additiveCategoryBalanceKey = (proposalId: string) => ['/api/proposals', proposalId, 'additives', 'category-balance'];

interface AdditiveCategoryLinesProps {
  proposalId: string;
  lines: EditableAdditiveLine[];
  onChange: (lines: EditableAdditiveLine[]) => void;
  disabled?: boolean;
}

export function AdditiveCategoryLines({ proposalId, lines, onChange, disabled }: AdditiveCategoryLinesProps) {
  const [showReport, setShowReport] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: categories = [] } = useQuery({
    queryKey: ['/api/proposal-categories'],
    queryFn: () => proposalCategoriesApi.getAll(),
    staleTime: 60_000,
  });

  const { data: balance, isLoading: balanceLoading } = useQuery<AdditiveCategoryBalance>({
    queryKey: additiveCategoryBalanceKey(proposalId),
    queryFn: () => proposalAdditivesApi.categoryBalance(proposalId),
  });

  const rowByCategoryId = useMemo(() => {
    const map = new Map<string, AdditiveCategoryBalanceRow>();
    for (const row of balance?.rows ?? []) if (row.categoryId) map.set(row.categoryId, row);
    return map;
  }, [balance]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [categories]
  );

  const updateLine = (localId: string, patch: Partial<EditableAdditiveLine>) => {
    onChange(lines.map((l) => (l.localId === localId ? { ...l, ...patch } : l)));
  };

  const handleCategoryChange = (line: EditableAdditiveLine, value: string) => {
    if (value === CUSTOM_CATEGORY) {
      updateLine(line.localId, { categoryId: null });
      return;
    }
    const row = rowByCategoryId.get(value);
    // Preço-hora padrão vem da proposta; a pessoa pode sobrescrever.
    const hourlyValue = line.hourlyValue.trim() ? line.hourlyValue : row && row.hourlyValue > 0 ? formatDecimal(row.hourlyValue) : '';
    updateLine(line.localId, { categoryId: value, customName: '', hourlyValue });
  };

  const lineValue = (line: EditableAdditiveLine): number | null => {
    const hours = parseSignedDecimal(line.hoursDelta);
    const price = parseSignedDecimal(line.hourlyValue);
    if (hours === null || price === null) return null;
    return Math.round(hours * price * 100) / 100;
  };

  const totalValue = lines.reduce((s, l) => s + (lineValue(l) ?? 0), 0);
  const hasProject = Boolean(balance?.projectId);

  const toggleRow = (key: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Categorias (horas)</Label>
          <p className="text-xs text-muted-foreground">
            Horas a mais ou a menos por categoria. Use negativo para reduzir.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setShowReport((v) => !v)} data-testid="button-additive-balance-toggle">
            {showReport ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Ver apontamento
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange([...lines, emptyAdditiveLine()])}
            data-testid="button-additive-line-add"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Categoria
          </Button>
        </div>
      </div>

      {showReport ? (
        <div className="rounded-md border bg-muted/30">
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {hasProject
              ? 'Esquerda: horas contratadas (proposta + aditivos). Direita: horas lançadas no projeto, agrupadas pela categoria cadastrada de quem lançou. Saldo = quanto ainda pode ser reduzido.'
              : 'Esta proposta ainda não virou projeto: não há horas lançadas, então qualquer categoria pode ser zerada.'}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Proposta</TableHead>
                <TableHead className="text-right">Aditivos</TableHead>
                <TableHead className="text-right">Contratado</TableHead>
                <TableHead className="text-right">Lançado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-4 text-center text-sm text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : (balance?.rows.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-4 text-center text-sm text-muted-foreground">Nenhuma categoria contratada.</TableCell>
                </TableRow>
              ) : (
                (balance?.rows ?? []).map((row) => {
                  const expandable = row.professionals.length > 0;
                  const expanded = expandedRows.has(row.key);
                  return (
                    <Fragment key={row.key}>
                      <TableRow
                        className={cn(expandable && 'cursor-pointer')}
                        onClick={() => expandable && toggleRow(row.key)}
                        data-testid={`row-additive-balance-${row.key}`}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-1">
                            {expandable ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
                            {row.name || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatHours(row.baseHours)}h</TableCell>
                        <TableCell className={cn('text-right text-sm', row.additiveHours < 0 && 'text-red-600', row.additiveHours > 0 && 'text-emerald-700')}>
                          {row.additiveHours === 0 ? '—' : `${row.additiveHours > 0 ? '+' : ''}${formatHours(row.additiveHours)}h`}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatHours(row.contractedHours)}h</TableCell>
                        <TableCell className="text-right text-sm">{formatHours(row.loggedHours)}h</TableCell>
                        <TableCell className={cn('text-right text-sm font-medium', row.availableHours < 0 && 'text-red-600')}>
                          {formatHours(row.availableHours)}h
                        </TableCell>
                      </TableRow>
                      {expanded
                        ? row.professionals.map((p) => (
                            <TableRow key={`${row.key}-${p.userId}`} className="bg-muted/40">
                              <TableCell colSpan={4} className="pl-9 text-xs text-muted-foreground">{p.name}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{formatHours(p.hours)}h</TableCell>
                              <TableCell />
                            </TableRow>
                          ))
                        : null}
                    </Fragment>
                  );
                })
              )}
              {balance && balance.uncategorized.hours > 0 ? (
                <TableRow className="text-amber-700 dark:text-amber-300">
                  <TableCell colSpan={4} className="text-xs">
                    Lançado por profissionais sem categoria cadastrada ({balance.uncategorized.professionals.map((p) => p.name).join(', ')})
                  </TableCell>
                  <TableCell className="text-right text-xs">{formatHours(balance.uncategorized.hours)}h</TableCell>
                  <TableCell />
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="space-y-2">
          {lines.map((line) => {
            const row = line.categoryId ? rowByCategoryId.get(line.categoryId) : undefined;
            const value = lineValue(line);
            const hours = parseSignedDecimal(line.hoursDelta);
            const exceeds = row && hours !== null && hours < 0 && row.contractedHours + hours < row.loggedHours;
            return (
              <div key={line.localId} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Categoria</Label>
                  <Select
                    value={line.categoryId ?? CUSTOM_CATEGORY}
                    onValueChange={(v) => handleCategoryChange(line, v)}
                    disabled={disabled}
                  >
                    <SelectTrigger data-testid={`select-additive-line-category-${line.localId}`}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_CATEGORY}>Outra (nome livre)</SelectItem>
                    </SelectContent>
                  </Select>
                  {!line.categoryId ? (
                    <Input
                      value={line.customName}
                      onChange={(e) => updateLine(line.localId, { customName: e.target.value })}
                      placeholder="Nome da categoria"
                      disabled={disabled}
                      data-testid={`input-additive-line-custom-${line.localId}`}
                    />
                  ) : null}
                  {row ? (
                    <p className="text-[11px] text-muted-foreground">
                      Contratado {formatHours(row.contractedHours)}h · lançado {formatHours(row.loggedHours)}h · saldo {formatHours(row.availableHours)}h
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Horas (±)</Label>
                  <Input
                    inputMode="decimal"
                    value={line.hoursDelta}
                    onChange={(e) => updateLine(line.localId, { hoursDelta: e.target.value })}
                    placeholder="-10"
                    disabled={disabled}
                    className={cn(exceeds && 'border-red-500')}
                    data-testid={`input-additive-line-hours-${line.localId}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preço-hora</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">R$</span>
                    <Input
                      inputMode="decimal"
                      value={line.hourlyValue}
                      onChange={(e) => updateLine(line.localId, { hourlyValue: e.target.value })}
                      placeholder="0,00"
                      disabled={disabled}
                      className="pl-8"
                      data-testid={`input-additive-line-price-${line.localId}`}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <div className={cn('h-9 rounded-md border bg-muted/40 px-2 text-sm leading-9', value !== null && value < 0 && 'text-red-600')}>
                    {value === null ? '—' : formatCurrencySigned(value)}
                  </div>
                </div>
                <div className="flex gap-1 sm:pb-0.5">
                  {row && row.availableHours > 0 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title={row.loggedHours > 0 ? `Reduzir ao máximo (−${formatHours(row.availableHours)}h)` : 'Zerar categoria'}
                      disabled={disabled}
                      onClick={() => updateLine(line.localId, { hoursDelta: `-${formatHours(row.availableHours)}` })}
                      data-testid={`button-additive-line-zero-${line.localId}`}
                    >
                      <Eraser className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Remover linha"
                    disabled={disabled}
                    onClick={() => onChange(lines.filter((l) => l.localId !== line.localId))}
                    data-testid={`button-additive-line-remove-${line.localId}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {exceeds && row ? (
                  <p className="text-xs text-red-600 sm:col-span-5">
                    Já há {formatHours(row.loggedHours)}h lançadas nesta categoria; só é possível reduzir até {formatHours(Math.max(0, row.availableHours))}h.
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="text-right text-sm text-muted-foreground">
            Total das categorias:{' '}
            <span className={cn('font-medium text-foreground', totalValue < 0 && 'text-red-600')}>{formatCurrencySigned(totalValue)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
