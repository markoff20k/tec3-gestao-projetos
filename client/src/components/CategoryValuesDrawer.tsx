import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Plus, Upload, Download, Trash2, Save } from 'lucide-react';
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
      toast({ title: 'Valores salvos com sucesso' });
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
    setCategoryValues(categoryValues.filter((_, i) => i !== index));
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

  const handleSave = () => {
    saveMutation.mutate(categoryValues);
  };

  const totalValue = useMemo(() => 
    categoryValues.reduce((sum, v) => sum + (v.value || 0), 0),
    [categoryValues]
  );

  const totalHours = useMemo(() =>
    categoryValues.reduce((sum, v) => sum + (v.hours || 0), 0),
    [categoryValues]
  );

  const exportCSV = () => {
    const header = 'categoria;valor;horas';
    const rows = categoryValues.map(v => 
      `${v.categoryName};${v.value};${v.hours}`
    );
    const content = [header, ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `categorias_${proposalCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').slice(1);
      const newValues: CategoryValue[] = [];
      
      lines.forEach(line => {
        const [name, value, hours] = line.split(';');
        if (name?.trim()) {
          newValues.push({
            proposalId,
            categoryName: name.trim(),
            value: parseFloat(value) || 0,
            hours: parseInt(hours) || 0,
          });
        }
      });
      
      setCategoryValues(newValues);
      setHasChanges(true);
      toast({ title: `${newValues.length} categorias importadas` });
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="text-lg font-semibold">
            Valores por Categoria - {proposalCode}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Defina os valores e horas por categoria para esta proposta
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
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
              <input
                type="file"
                accept=".csv"
                id="import-csv"
                className="hidden"
                onChange={importCSV}
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => document.getElementById('import-csv')?.click()}
                title="Importar CSV"
                data-testid="button-import-csv"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={exportCSV}
                title="Exportar CSV"
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>

            {filteredCategories.length > 0 && searchTerm && (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {filteredCategories.slice(0, 10).map((cat) => (
                  <Badge 
                    key={cat.id}
                    variant="outline" 
                    className="cursor-pointer hover-elevate text-xs"
                    onClick={() => addCategory(cat.name, cat.id)}
                    data-testid={`badge-category-${cat.code}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {cat.name}
                  </Badge>
                ))}
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
                          onClick={() => removeCategory(index)}
                          data-testid={`button-remove-${index}`}
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
                {categoryValues.length} categorias
              </Badge>
            </div>
          </div>
        </div>

        <SheetFooter className="p-4 border-t gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-drawer"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="button-save-categories"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
