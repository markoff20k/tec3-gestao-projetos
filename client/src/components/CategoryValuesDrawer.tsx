import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Plus, Upload, Download, Trash2, Save, Maximize2, PanelRightClose, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface ProposalCategory {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface CategoryValue {
  id?: string;
  proposalId: string;
  categoryId?: string;
  categoryName: string;
  value: number;
  hours: number;
}

interface CategoryValuesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  proposalCode: string;
}

export function CategoryValuesDrawer({ 
  open, 
  onOpenChange, 
  proposalId,
  proposalCode 
}: CategoryValuesDrawerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryValues, setCategoryValues] = useState<CategoryValue[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const initializedRef = useRef(false);
  const lastProposalIdRef = useRef<string | null>(null);

  const { data: categories = [] } = useQuery<ProposalCategory[]>({
    queryKey: ['/api/proposal-categories'],
    enabled: open,
  });

  const { data: existingValues = [], isLoading, isFetched } = useQuery<CategoryValue[]>({
    queryKey: ['/api/proposals', proposalId, 'category-values'],
    enabled: open && !!proposalId,
  });

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      lastProposalIdRef.current = null;
      return;
    }
    
    if (initializedRef.current && lastProposalIdRef.current === proposalId) {
      return;
    }

    if (isFetched) {
      if (existingValues && existingValues.length > 0) {
        const mapped = existingValues.map((v: any) => ({
          id: v.id,
          proposalId: v.proposalId,
          categoryId: v.categoryId,
          categoryName: v.category?.name || v.customName || '',
          value: v.value || 0,
          hours: v.hours || 0,
        }));
        setCategoryValues(mapped);
      } else {
        setCategoryValues([]);
      }
      setHasChanges(false);
      initializedRef.current = true;
      lastProposalIdRef.current = proposalId;
    }
  }, [existingValues, open, isFetched, proposalId]);

  const saveMutation = useMutation({
    mutationFn: async (values: CategoryValue[]) => {
      const response = await fetch(`/api/proposals/${proposalId}/category-values`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ values }),
      });
      if (!response.ok) throw new Error('Erro ao salvar');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals', proposalId, 'category-values'] });
      toast({ title: 'Valores por categoria salvos', variant: 'success' });
      setHasChanges(false);
    },
    onError: () => {
      toast({ title: 'Erro ao salvar valores', variant: 'destructive' });
    },
  });

  const filteredCategories = useMemo(() => {
    const usedNames = new Set(categoryValues.map(v => v.categoryName.toLowerCase()));
    return categories.filter(cat => 
      !usedNames.has(cat.name.toLowerCase()) &&
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [categories, categoryValues, searchTerm]);

  const addCategory = (name: string, categoryId?: string) => {
    if (!name.trim()) return;
    const exists = categoryValues.some(v => 
      v.categoryName.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      toast({ title: 'Categoria já adicionada', variant: 'destructive' });
      return;
    }
    setCategoryValues([...categoryValues, {
      proposalId,
      categoryId,
      categoryName: name.trim(),
      value: 0,
      hours: 0,
    }]);
    setHasChanges(true);
    setNewCategoryName('');
    setSearchTerm('');
  };

  const removeCategory = (index: number) => {
    setCategoryValues((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const updateValue = (index: number, field: 'value' | 'hours', val: string) => {
    const updated = [...categoryValues];
    updated[index] = {
      ...updated[index],
      [field]: field === 'value' ? parseFloat(val) || 0 : parseInt(val) || 0,
    };
    setCategoryValues(updated);
    setHasChanges(true);
  };

  const invalidRows = useMemo(() => {
    if (categoryValues.length === 0) return [] as CategoryValue[];
    return categoryValues.filter((v) => !(Number(v.value) > 0) || !(Number(v.hours) > 0));
  }, [categoryValues]);

  const canSave = useMemo(() => {
    if (!hasChanges) return false;
    if (saveMutation.isPending) return false;
    if (categoryValues.length === 0) return true;
    return invalidRows.length === 0;
  }, [categoryValues.length, hasChanges, invalidRows.length, saveMutation.isPending]);

  const handleSave = () => {
    if (categoryValues.length > 0 && invalidRows.length > 0) {
      const names = invalidRows
        .map((v) => v.categoryName)
        .filter(Boolean)
        .slice(0, 4);

      const remaining = Math.max(0, invalidRows.length - names.length);
      toast({
        title: 'Preencha Valor e Horas para salvar',
        description:
          names.length > 0
            ? `${names.join(', ')}${remaining > 0 ? ` e mais ${remaining}` : ''}.`
            : 'Existem categorias com campos em branco.',
        variant: 'destructive',
      });
      return;
    }

    saveMutation.mutate(categoryValues);
  };

  const totalValue = useMemo(() =>
    categoryValues.reduce((sum, v) => sum + (Number(v.value) || 0) * (Number(v.hours) || 0), 0),
    [categoryValues]
  );

  const totalHours = useMemo(() =>
    categoryValues.reduce((sum, v) => sum + (v.hours || 0), 0),
    [categoryValues]
  );


  const escapeCsvField = (value: unknown) => {
    const raw = String(value ?? '');
    if (raw.includes('"')) {
      const escaped = raw.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    if (raw.includes(';') || raw.includes('\n') || raw.includes('\r')) {
      return `"${raw}"`;
    }
    return raw;
  };

  const downloadTemplateCSV = () => {
    const header = 'Codigo_da_categoria;Categoria;Valor_da_hora;Quantidade_de_horas';
    const rows = [...categories]
      .filter((c) => c && typeof c.name === 'string')
      .map((c, idx) => `${idx + 1};${escapeCsvField(c.name)};;`);

    const content = [`\ufeff${header}`, ...rows].join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-cadastro-valor-hora-categoria-proposta.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return;

      const headerLine = lines[0];
      const headerCells = headerLine.split(';').map((h) => h.trim().toLowerCase());
      const isTemplateWithCode =
        headerCells.includes('codigo_da_categoria') &&
        headerCells.includes('categoria') &&
        headerCells.includes('valor_da_hora') &&
        headerCells.includes('quantidade_de_horas');

      const dataLines = lines.slice(1);
      const newValues: CategoryValue[] = [];

      const parseNumber = (raw: string | undefined) => {
        const normalized = String(raw ?? '')
          .trim()
          .replace(/\./g, '')
          .replace(',', '.');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
      };
      
      dataLines.forEach((line) => {
        const parts = line.split(';');
        if (isTemplateWithCode) {
          const name = parts[1];
          const value = parts[2];
          const hours = parts[3];
          if (name?.trim()) {
            newValues.push({
              proposalId,
              categoryName: name.trim(),
              value: parseNumber(value),
              hours: Math.trunc(parseNumber(hours)),
            });
          }
          return;
        }

        const name = parts[0];
        const value = parts[1];
        const hours = parts[2];
        if (name?.trim()) {
          newValues.push({
            proposalId,
            categoryName: name.trim(),
            value: parseNumber(value),
            hours: Math.trunc(parseNumber(hours)),
          });
        }
      });
      
      setCategoryValues(newValues);
      setHasChanges(true);
      const importedCount = newValues.length;
      toast({
        title: `${importedCount} ${importedCount === 1 ? 'categoria importada' : 'categorias importadas'}`,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleClose = () => {
    onOpenChange(false);
    setIsFullscreen(false);
  };

  const requestClose = () => {
    if (hasChanges) {
      setConfirmDiscardOpen(true);
      return;
    }
    handleClose();
  };

  const renderContent = () => (
    <>
      <div className="p-4 border-b bg-muted/30 space-y-3">
        <div className="rounded-md bg-muted/20 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-category"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <input
                type="file"
                accept=".csv"
                id={`import-csv-${isFullscreen ? 'fullscreen' : 'sheet'}`}
                className="hidden"
                onChange={importCSV}
              />
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => document.getElementById(`import-csv-${isFullscreen ? 'fullscreen' : 'sheet'}`)?.click()}
                title="Importar CSV"
                data-testid="button-import-csv"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  if (!categories || categories.length === 0) {
                    toast({
                      title: 'Categorias ainda não carregadas',
                      description: 'Aguarde um instante e tente novamente.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  downloadTemplateCSV();
                }}
                title="Baixar template"
                data-testid="button-download-template"
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar template
              </Button>
            </div>
          </div>
        </div>

        {filteredCategories.length > 0 && (
          <div className="rounded-md bg-muted/20 p-3">
            <Label className="text-xs text-muted-foreground mb-2 block">
              Categorias disponíveis ({filteredCategories.length}):
            </Label>
            <div
              title="Arraste o canto inferior direito para aumentar"
              className={`relative flex flex-wrap items-start gap-1.5 overflow-y-auto rounded-md bg-background p-2 resize-y min-h-16 pr-7 pb-7 ${
                isFullscreen ? 'h-48 max-h-80' : 'h-32 max-h-64'
              }`}
            >
              {filteredCategories.map((cat) => (
                <Badge 
                  key={cat.id}
                  variant="outline" 
                  className="cursor-pointer hover-elevate text-xs h-7 leading-none min-w-0 max-w-full sm:max-w-[260px] whitespace-nowrap"
                  onClick={() => addCategory(cat.name, cat.id)}
                  data-testid={`badge-category-${cat.code}`}
                >
                  <Plus className="h-3 w-3 mr-1 shrink-0" />
                  <span className="min-w-0 flex-1 truncate block">{cat.name}</span>
                </Badge>
              ))}

              <div className="absolute bottom-1 right-1 pointer-events-none select-none">
                <div className="rounded-sm bg-background/80 p-0.5 text-muted-foreground/80">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <Input
            placeholder="Nome da nova categoria..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory(newCategoryName)}
            className="flex-1"
            data-testid="input-new-category"
          />
          <Button 
            size="sm"
            onClick={() => addCategory(newCategoryName)}
            disabled={!newCategoryName.trim()}
            data-testid="button-add-category"
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            Carregando...
          </div>
        ) : categoryValues.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhuma categoria adicionada.
            <br />
            Busque uma categoria acima ou crie uma nova.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Categoria</TableHead>
                <TableHead className="w-[25%]">Valor (R$)</TableHead>
                <TableHead className="w-[20%]">Horas</TableHead>
                <TableHead className="w-[15%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryValues.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium text-sm">
                    {item.categoryName}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.value || ''}
                      onChange={(e) => updateValue(index, 'value', e.target.value)}
                      className="h-8"
                      data-testid={`input-value-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={item.hours || ''}
                      onChange={(e) => updateValue(index, 'hours', e.target.value)}
                      className="h-8"
                      data-testid={`input-hours-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setPendingDeleteIndex(index)}
                      data-testid={`button-remove-${index}`}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>

      <AlertDialog
        open={pendingDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
              {pendingDeleteIndex !== null && categoryValues[pendingDeleteIndex]
                ? ` A categoria “${categoryValues[pendingDeleteIndex].categoryName}” será removida.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteIndex(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteIndex === null) return;
                removeCategory(pendingDeleteIndex);
                setPendingDeleteIndex(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-6">
            <div>
              <Label className="text-xs text-muted-foreground">Total Valor</Label>
              <div className="text-lg font-semibold text-primary">
                {formatCurrency(totalValue)}
              </div>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div>
              <Label className="text-xs text-muted-foreground">Total Horas</Label>
              <div className="text-lg font-semibold">
                {totalHours}h
              </div>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {categoryValues.length} {categoryValues.length === 1 ? 'categoria' : 'categorias'}
          </Badge>
        </div>
      </div>
    </>
  );

  const renderFooter = () => (
    <div className="flex justify-end gap-2 p-4 border-t">
      <Button 
        onClick={handleSave}
        disabled={!canSave}
        data-testid="button-save-categories"
      >
        <Save className="h-4 w-4 mr-2" />
        {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );

  return (
    <>
      {/* Sheet Mode */}
      <Sheet
        open={open && !isFullscreen}
        onOpenChange={(o) => {
          if (o) {
            onOpenChange(true);
            return;
          }
          requestClose();
        }}
      >
        <SheetContent 
          side="right" 
          className="w-full sm:w-[600px] sm:max-w-[600px] p-0 flex flex-col"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          actionButton={
            <button
              onClick={() => setIsFullscreen(true)}
              title="Expandir para tela cheia"
              className="h-6 w-6 flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="button-expand-categories"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          }
        >
          <SheetHeader className="p-6 pb-4 border-b">
            <SheetTitle className="text-lg font-semibold">
              Valores por Categoria - {proposalCode}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Defina os valores e horas por categoria para esta proposta
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden">
            {renderContent()}
          </div>

          {renderFooter()}
        </SheetContent>
      </Sheet>

      {/* Fullscreen Mode */}
      <Dialog 
        open={open && isFullscreen} 
        onOpenChange={(o) => {
          if (o) return;
          requestClose();
        }}
      >
        <DialogContent 
          className="max-w-[95vw] h-[90vh] flex flex-col overflow-hidden p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          actionButton={
            <button
              onClick={() => setIsFullscreen(false)}
              title="Voltar para painel lateral"
              className="h-6 w-6 flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="button-minimize-categories"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          }
        >
          <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">
              Valores por Categoria - {proposalCode}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Defina os valores e horas por categoria para esta proposta
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col overflow-hidden">
            {renderContent()}
          </div>

          {renderFooter()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas. Se fechar agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDiscardOpen(false);
                handleClose();
              }}
            >
              Descartar e fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
