import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ArrowRight, ChevronLeft, ChevronRight, Pencil, RotateCcw, Settings2, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Calendar, DollarSign, SlidersHorizontal, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { proposalsApi, clientsApi, authApi, Proposal, Client } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CategoryValuesDrawer } from '@/components/CategoryValuesDrawer';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500',
  in_review: 'bg-yellow-500',
  sent: 'bg-blue-500',
  negotiating: 'bg-purple-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  cancelled: 'bg-gray-400',
  converted: 'bg-teal-500',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em Revisão',
  sent: 'Enviada',
  negotiating: 'Negociação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  converted: 'Convertida',
};

const typeLabels: Record<string, string> = {
  fixed_price: 'Preço Fixo',
  appropriation: 'Apropriação',
  umbrella: 'Guarda-Chuva',
  service_order: 'Ordem de Serviço',
  additive: 'Aditivo',
};

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width?: string;
  category: 'basic' | 'classification' | 'values' | 'dates' | 'people';
}

const defaultColumns: ColumnConfig[] = [
  { id: 'code', label: 'Cód. proposta', visible: true, width: 'w-28', category: 'basic' },
  { id: 'revision', label: 'Revisão', visible: true, width: 'w-20', category: 'basic' },
  { id: 'contractCode', label: 'Cód. contrato', visible: false, width: 'w-28', category: 'basic' },
  { id: 'type', label: 'Tipo proposta', visible: true, width: 'w-32', category: 'classification' },
  { id: 'umbrellaRef', label: 'Proposta guarda chuva', visible: false, width: 'w-36', category: 'classification' },
  { id: 'client', label: 'Cliente', visible: true, width: 'w-48', category: 'basic' },
  { id: 'coordinatorName', label: 'Resp. proposta', visible: false, width: 'w-36', category: 'people' },
  { id: 'title', label: 'Titulo', visible: true, width: 'w-64', category: 'basic' },
  { id: 'createdAt', label: 'Dt. solic', visible: false, width: 'w-28', category: 'dates' },
  { id: 'deliveryDate', label: 'Dt. entrega', visible: false, width: 'w-28', category: 'dates' },
  { id: 'dueDate', label: 'Dt. vencimento', visible: false, width: 'w-28', category: 'dates' },
  { id: 'updatedAt', label: 'Dt. modificação', visible: false, width: 'w-28', category: 'dates' },
  { id: 'duration', label: 'Duração', visible: false, width: 'w-24', category: 'values' },
  { id: 'expectation', label: 'Expectativa', visible: false, width: 'w-28', category: 'values' },
  { id: 'activityType', label: 'Tipo atividade', visible: false, width: 'w-32', category: 'classification' },
  { id: 'termMonths', label: 'Prazo (meses)', visible: false, width: 'w-28', category: 'values' },
  { id: 'hours', label: 'Horas', visible: false, width: 'w-24', category: 'values' },
  { id: 'riskAssessment', label: 'Aval. risco', visible: false, width: 'w-32', category: 'values' },
  { id: 'maintenanceNum', label: 'Nº manutenção', visible: false, width: 'w-28', category: 'values' },
  { id: 'subcontracted', label: 'Nº subcontratação', visible: false, width: 'w-32', category: 'values' },
  { id: 'acquisitionMargin', label: 'Margem aquisição', visible: false, width: 'w-36', category: 'values' },
  { id: 'expense', label: 'Despesas', visible: false, width: 'w-28', category: 'values' },
  { id: 'anfibex', label: 'Anfíbes', visible: false, width: 'w-24', category: 'values' },
  { id: 'discount', label: 'Desconto', visible: false, width: 'w-24', category: 'values' },
  { id: 'proposalOrigin', label: 'Nº veio proposta', visible: false, width: 'w-32', category: 'basic' },
  { id: 'status', label: 'Situação', visible: true, width: 'w-28', category: 'basic' },
  { id: 'totalValue', label: 'Valor', visible: false, width: 'w-32', category: 'values' },
  { id: 'sentDate', label: 'Dt. Envio', visible: false, width: 'w-28', category: 'dates' },
  { id: 'sentByName', label: 'Enviado por', visible: false, width: 'w-28', category: 'people' },
  { id: 'specialist', label: 'Especialista', visible: false, width: 'w-32', category: 'people' },
  { id: 'workOrders', label: 'OAs', visible: false, width: 'w-20', category: 'basic' },
  { id: 'mainType', label: 'Tipo principal', visible: false, width: 'w-28', category: 'classification' },
  { id: 'utility', label: 'Utilidade', visible: false, width: 'w-28', category: 'classification' },
  { id: 'categoryValues', label: 'Valores por Categoria', visible: true, width: 'w-36', category: 'values' },
];

const categoryLabels: Record<string, string> = {
  basic: 'Informações Básicas',
  classification: 'Classificação',
  values: 'Valores',
  dates: 'Datas',
  people: 'Responsáveis',
};

export default function Proposals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [maxVisibleColumns, setMaxVisibleColumns] = useState(8);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    type: 'fixed_price',
    totalValue: '',
    estimatedHours: '',
    coordinatorName: '',
  });
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    type: 'fixed_price',
    status: 'draft',
    totalValue: '',
    estimatedHours: '',
    coordinatorName: '',
  });

  // Advanced Filter states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [coordinatorFilter, setCoordinatorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  // Sort states
  const [sortColumn, setSortColumn] = useState<string>('code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (columnId: string) => {
    if (sortColumn !== columnId) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  // Filter helper functions
  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setCurrentPage(1);
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilters([]);
    setTypeFilters([]);
    setDateFrom('');
    setDateTo('');
    setValueMin('');
    setValueMax('');
    setCoordinatorFilter('');
    setClientFilter('');
    setCurrentPage(1);
  };

  const activeFilterCount =
    statusFilters.length +
    typeFilters.length +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (valueMin ? 1 : 0) +
    (valueMax ? 1 : 0) +
    (coordinatorFilter ? 1 : 0) +
    (clientFilter ? 1 : 0);

  // Load column preferences from server on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.getPreferences()
        .then((prefs) => {
          if (prefs.proposalColumns && Array.isArray(prefs.proposalColumns)) {
            setColumns(prefs.proposalColumns);
          }
        })
        .catch(() => {
          // Fallback to localStorage
          const savedColumns = localStorage.getItem('proposalColumns');
          if (savedColumns) {
            try {
              const parsed = JSON.parse(savedColumns);
              setColumns(parsed);
            } catch (e) {}
          }
        });
    }
  }, []);

  // Save column preferences when they change
  const saveColumnPreferences = (newColumns: ColumnConfig[]) => {
    setColumns(newColumns);
    // Save to localStorage as backup
    localStorage.setItem('proposalColumns', JSON.stringify(newColumns));
    // Save to server
    const token = localStorage.getItem('token');
    if (token) {
      authApi.updatePreferences({ proposalColumns: newColumns }).catch(() => {});
    }
  };

  const toggleColumn = (columnId: string) => {
    const newColumns = columns.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    );
    saveColumnPreferences(newColumns);
  };

  const resetColumns = () => {
    saveColumnPreferences(defaultColumns);
  };

  const visibleColumns = columns.filter(col => col.visible);
  
  // Calculate max visible columns based on container width
  const calculateMaxColumns = useCallback(() => {
    if (!tableContainerRef.current) return;
    const containerWidth = tableContainerRef.current.offsetWidth;
    // Base widths: expand button (48px), actions column (96px), padding (32px)
    const reservedWidth = 176;
    const avgColumnWidth = 140; // Average column width in pixels
    const available = containerWidth - reservedWidth;
    const maxCols = Math.max(3, Math.floor(available / avgColumnWidth));
    setMaxVisibleColumns(maxCols);
  }, []);

  // Recalculate on resize
  useEffect(() => {
    calculateMaxColumns();
    const resizeObserver = new ResizeObserver(() => {
      calculateMaxColumns();
    });
    if (tableContainerRef.current) {
      resizeObserver.observe(tableContainerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [calculateMaxColumns]);

  // Columns that fit in the table
  const primaryColumns = useMemo(() => {
    return visibleColumns.slice(0, maxVisibleColumns);
  }, [visibleColumns, maxVisibleColumns]);

  // Columns that go into the expandable panel
  const overflowColumns = useMemo(() => {
    return visibleColumns.slice(maxVisibleColumns);
  }, [visibleColumns, maxVisibleColumns]);

  const hasOverflowColumns = overflowColumns.length > 0;

  const toggleRowExpansion = (proposalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(proposalId)) {
        newSet.delete(proposalId);
      } else {
        newSet.add(proposalId);
      }
      return newSet;
    });
  };

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ['/api/proposals'],
    queryFn: () => proposalsApi.getAll(),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Proposal>) => proposalsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Proposta criada com sucesso' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar proposta', description: error.message, variant: 'destructive' });
    },
  });

  const convertMutation = useMutation({
    mutationFn: (proposalId: string) => proposalsApi.convert(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Proposta convertida em projeto com sucesso' });
      setDetailSheetOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao converter proposta', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Proposal> }) => proposalsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Proposta atualizada com sucesso' });
      setEditDialogOpen(false);
      setSelectedProposal(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar proposta', description: error.message, variant: 'destructive' });
    },
  });

  const handleRowClick = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setDetailSheetOpen(true);
  };

  const handleEditProposal = (proposal: Proposal, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedProposal(proposal);
    setEditFormData({
      title: proposal.title || '',
      description: proposal.description || '',
      clientId: proposal.clientId || '',
      type: proposal.type || 'fixed_price',
      status: proposal.status || 'draft',
      totalValue: String(proposal.totalValue || 0),
      estimatedHours: String(proposal.estimatedHours || 0),
      coordinatorName: proposal.coordinatorName || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;
    updateMutation.mutate({
      id: selectedProposal.id,
      data: {
        ...editFormData,
        totalValue: parseFloat(editFormData.totalValue) || 0,
        estimatedHours: parseInt(editFormData.estimatedHours) || 0,
      },
    });
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      clientId: '',
      type: 'fixed_price',
      totalValue: '',
      estimatedHours: '',
      coordinatorName: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      totalValue: parseFloat(formData.totalValue) || 0,
      estimatedHours: parseInt(formData.estimatedHours) || 0,
    });
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : (value || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numValue);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  // Get unique coordinators for filter dropdown
  const uniqueCoordinators = useMemo(() => {
    const coords = new Set<string>();
    proposals.forEach((p) => {
      if (p.coordinatorName) coords.add(p.coordinatorName);
    });
    return Array.from(coords).sort();
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    const filtered = proposals.filter((p) => {
      const searchMatch =
        !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.client?.razaoSocial?.toLowerCase().includes(search.toLowerCase()) ||
        p.client?.cnpj?.toLowerCase().includes(search.toLowerCase());

      const statusMatch = statusFilters.length === 0 || statusFilters.includes(p.status);
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(p.type);
      
      // Date filter
      const dateMatch = (() => {
        if (!dateFrom && !dateTo) return true;
        const proposalDate = p.createdAt ? new Date(p.createdAt) : null;
        if (!proposalDate) return false;
        if (dateFrom && proposalDate < new Date(dateFrom)) return false;
        if (dateTo && proposalDate > new Date(dateTo + 'T23:59:59')) return false;
        return true;
      })();

      // Value filter
      const valueMatch = (() => {
        if (!valueMin && !valueMax) return true;
        const value = p.totalValue || 0;
        if (valueMin && value < parseFloat(valueMin)) return false;
        if (valueMax && value > parseFloat(valueMax)) return false;
        return true;
      })();

      // Coordinator filter
      const coordMatch = !coordinatorFilter || p.coordinatorName === coordinatorFilter;

      // Client filter
      const clientMatch = !clientFilter || p.clientId === clientFilter;

      return searchMatch && statusMatch && typeMatch && dateMatch && valueMatch && coordMatch && clientMatch;
    });

    // Sort the filtered results
    return filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'code':
          aValue = a.code || '';
          bValue = b.code || '';
          break;
        case 'title':
          aValue = a.title || '';
          bValue = b.title || '';
          break;
        case 'client':
          aValue = a.client?.razaoSocial || '';
          bValue = b.client?.razaoSocial || '';
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'type':
          aValue = a.type || '';
          bValue = b.type || '';
          break;
        case 'totalValue':
          aValue = a.totalValue || 0;
          bValue = b.totalValue || 0;
          break;
        case 'createdAt':
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case 'updatedAt':
          aValue = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          bValue = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          break;
        case 'sentDate':
          aValue = a.sentDate ? new Date(a.sentDate).getTime() : 0;
          bValue = b.sentDate ? new Date(b.sentDate).getTime() : 0;
          break;
        case 'approvalDate':
          aValue = (a as any).approvalDate ? new Date((a as any).approvalDate).getTime() : 0;
          bValue = (b as any).approvalDate ? new Date((b as any).approvalDate).getTime() : 0;
          break;
        case 'currentRevision':
          aValue = (a as any).currentRevision || 0;
          bValue = (b as any).currentRevision || 0;
          break;
        case 'probability':
          aValue = (a as any).probability || 0;
          bValue = (b as any).probability || 0;
          break;
        default:
          aValue = (a as any)[sortColumn] || '';
          bValue = (b as any)[sortColumn] || '';
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue, 'pt-BR')
          : bValue.localeCompare(aValue, 'pt-BR');
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }, [proposals, search, statusFilters, typeFilters, dateFrom, dateTo, valueMin, valueMax, coordinatorFilter, clientFilter, sortColumn, sortDirection]);

  const totalPages = Math.ceil(filteredProposals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProposals = filteredProposals.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const getCellValue = (proposal: Proposal, columnId: string) => {
    switch (columnId) {
      case 'code':
        return <span className="font-medium text-primary">{proposal.code}</span>;
      case 'revision':
        return proposal.revision || 0;
      case 'client':
        return (
          <span className="truncate block max-w-[180px]" title={proposal.client?.razaoSocial}>
            {proposal.client?.razaoSocial || '-'}
          </span>
        );
      case 'title':
        return (
          <span className="truncate block max-w-[240px]" title={proposal.title}>
            {proposal.title}
          </span>
        );
      case 'status':
        return (
          <Badge className={`text-xs text-white whitespace-nowrap ${statusColors[proposal.status]}`}>
            {statusLabels[proposal.status] || proposal.status}
          </Badge>
        );
      case 'type':
        return (
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {typeLabels[proposal.type] || proposal.type}
          </Badge>
        );
      case 'totalValue':
        return <span className="font-medium">{formatCurrency(proposal.totalValue)}</span>;
      case 'coordinatorName':
        return proposal.coordinatorName || '-';
      case 'specialist':
        return proposal.specialist || '-';
      case 'sentByName':
        return proposal.sentByName || '-';
      case 'activityType':
        return proposal.activityType || '-';
      case 'umbrellaRef':
        return proposal.umbrellaRef || '-';
      case 'mainType':
        return proposal.mainType || '-';
      case 'utility':
        return proposal.utility || '-';
      case 'workOrders':
        return proposal.workOrders || '-';
      case 'createdAt':
        return formatDate(proposal.createdAt);
      case 'updatedAt':
        return formatDate(proposal.updatedAt);
      case 'sentDate':
        return formatDate(proposal.sentDate);
      case 'contractCode':
        return (proposal as any).contractCode || '-';
      case 'deliveryDate':
        return formatDate((proposal as any).deliveryDate);
      case 'dueDate':
        return formatDate((proposal as any).dueDate);
      case 'duration':
        return (proposal as any).duration || '-';
      case 'expectation':
        return (proposal as any).expectation || '-';
      case 'termMonths':
        return (proposal as any).termMonths || '-';
      case 'hours':
        return (proposal as any).hours || '-';
      case 'riskAssessment':
        return (proposal as any).riskAssessment || '-';
      case 'maintenanceNum':
        return (proposal as any).maintenanceNum || '-';
      case 'subcontracted':
        return (proposal as any).subcontracted || '-';
      case 'acquisitionMargin':
        return (proposal as any).acquisitionMargin || '-';
      case 'expense':
        return (proposal as any).expense || '-';
      case 'anfibex':
        return (proposal as any).anfibex || '-';
      case 'discount':
        return (proposal as any).discount || '-';
      case 'proposalOrigin':
        return (proposal as any).proposalOrigin || '-';
      case 'categoryValues':
        const categoryTotal = (proposal as any).categoryValuesTotal || 0;
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-primary hover-elevate"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProposal(proposal);
              setCategoryDrawerOpen(true);
            }}
            data-testid={`button-category-values-${proposal.id}`}
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            {formatCurrency(categoryTotal)}
          </Button>
        );
      default:
        return '-';
    }
  };

  const groupedColumns = useMemo(() => {
    const groups: Record<string, ColumnConfig[]> = {};
    columns.forEach(col => {
      if (!groups[col.category]) groups[col.category] = [];
      groups[col.category].push(col);
    });
    return groups;
  }, [columns]);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-semibold">Propostas</h1>
            <p className="text-sm text-muted-foreground">
              {filteredProposals.length} propostas encontradas
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-proposal">
                <Plus className="h-4 w-4 mr-2" />
                Nova Proposta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Proposta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    data-testid="input-proposal-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    data-testid="input-proposal-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <Select
                      value={formData.clientId}
                      onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                    >
                      <SelectTrigger data-testid="select-proposal-client">
                        <SelectValue placeholder="Selecione um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.razaoSocial}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger data-testid="select-proposal-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_price">Preço Fixo</SelectItem>
                        <SelectItem value="appropriation">Apropriação</SelectItem>
                        <SelectItem value="umbrella">Guarda-Chuva</SelectItem>
                        <SelectItem value="service_order">Ordem de Serviço</SelectItem>
                        <SelectItem value="additive">Aditivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalValue">Valor Total (R$)</Label>
                    <Input
                      id="totalValue"
                      type="number"
                      step="0.01"
                      data-testid="input-proposal-value"
                      value={formData.totalValue}
                      onChange={(e) => setFormData({ ...formData, totalValue: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedHours">Horas Estimadas</Label>
                    <Input
                      id="estimatedHours"
                      type="number"
                      data-testid="input-proposal-hours"
                      value={formData.estimatedHours}
                      onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coordinatorName">Coordenador</Label>
                  <Input
                    id="coordinatorName"
                    data-testid="input-proposal-coordinator"
                    value={formData.coordinatorName}
                    onChange={(e) => setFormData({ ...formData, coordinatorName: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" data-testid="button-save-proposal" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters Bar */}
        <Card className="flex-shrink-0 mt-4">
          <CardContent className="p-4">
            <div className="space-y-4">
              {/* Top Row: Search + Filter Controls + Column Config */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-testid="input-search-proposals"
                    placeholder="Buscar por código, título ou cliente..."
                    className="pl-10"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant={filtersOpen ? 'default' : 'outline'}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    data-testid="button-toggle-filters"
                    className="relative"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filtros
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground">
                        {activeFilterCount}
                      </Badge>
                    )}
                    <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                  </Button>
                  
                  {(activeFilterCount > 0 || search) && (
                    <Button
                      variant="ghost"
                      onClick={clearAllFilters}
                      data-testid="button-clear-all-filters"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Limpar
                    </Button>
                  )}
                </div>

                <Popover open={columnConfigOpen} onOpenChange={setColumnConfigOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-configure-columns">
                      <Settings2 className="h-4 w-4 mr-2" />
                      Colunas
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                        {visibleColumns.length}
                      </Badge>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Configurar Colunas</h4>
                        <Button variant="ghost" size="sm" onClick={resetColumns} data-testid="button-reset-columns">
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Resetar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {hasOverflowColumns 
                          ? `${primaryColumns.length} na tabela, ${overflowColumns.length} no painel expansível`
                          : 'Selecione as colunas que deseja visualizar'}
                      </p>
                      <Separator />
                      <ScrollArea className="h-[300px] pr-4">
                        {Object.entries(groupedColumns).map(([category, cols]) => (
                          <div key={category} className="mb-4">
                            <h5 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                              {categoryLabels[category]}
                            </h5>
                            <div className="space-y-2">
                              {cols.map(col => (
                                <label
                                  key={col.id}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5"
                                  data-testid={`column-toggle-${col.id}`}
                                >
                                  <Checkbox
                                    checked={col.visible}
                                    onCheckedChange={() => toggleColumn(col.id)}
                                    data-testid={`checkbox-column-${col.id}`}
                                  />
                                  <span className="text-sm">{col.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Active Filter Chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {statusFilters.map((status) => (
                    <Badge
                      key={status}
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => toggleStatusFilter(status)}
                    >
                      <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                      {statusLabels[status]}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {typeFilters.map((type) => (
                    <Badge
                      key={type}
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => toggleTypeFilter(type)}
                    >
                      {typeLabels[type]}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {(dateFrom || dateTo) && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                    >
                      <Calendar className="h-3 w-3" />
                      {dateFrom && dateTo
                        ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}`
                        : dateFrom
                        ? `A partir de ${formatDate(dateFrom)}`
                        : `Até ${formatDate(dateTo)}`}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                  {(valueMin || valueMax) && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => { setValueMin(''); setValueMax(''); }}
                    >
                      <DollarSign className="h-3 w-3" />
                      {valueMin && valueMax
                        ? `${formatCurrency(parseFloat(valueMin))} - ${formatCurrency(parseFloat(valueMax))}`
                        : valueMin
                        ? `Mín: ${formatCurrency(parseFloat(valueMin))}`
                        : `Máx: ${formatCurrency(parseFloat(valueMax))}`}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                  {coordinatorFilter && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => setCoordinatorFilter('')}
                    >
                      Coord: {coordinatorFilter}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                  {clientFilter && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => setClientFilter('')}
                    >
                      Cliente: {clients.find((c) => c.id === clientFilter)?.razaoSocial || clientFilter}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                </div>
              )}

              {/* Expandable Filter Panel */}
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleContent className="space-y-4">
                  <Separator className="my-2" />

                  {/* Status Filters */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Status</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <Button
                          key={key}
                          variant={statusFilters.includes(key) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleStatusFilter(key)}
                          data-testid={`filter-status-${key}`}
                          className={`gap-2 ${statusFilters.includes(key) ? '' : 'text-muted-foreground'}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusColors[key]}`} />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Type Filters */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Tipo de Proposta</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <Button
                          key={key}
                          variant={typeFilters.includes(key) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleTypeFilter(key)}
                          data-testid={`filter-type-${key}`}
                          className={typeFilters.includes(key) ? '' : 'text-muted-foreground'}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Date and Value Range + Coordinator + Client */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Date Range */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Período</Label>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                          data-testid="filter-date-from"
                          className="flex-1"
                        />
                        <Input
                          type="date"
                          value={dateTo}
                          onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                          data-testid="filter-date-to"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    {/* Value Range */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Valor (R$)</Label>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Mín"
                          value={valueMin}
                          onChange={(e) => { setValueMin(e.target.value); setCurrentPage(1); }}
                          data-testid="filter-value-min"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Máx"
                          value={valueMax}
                          onChange={(e) => { setValueMax(e.target.value); setCurrentPage(1); }}
                          data-testid="filter-value-max"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    {/* Coordinator */}
                    <div className="space-y-2">
                      <Label className="font-medium">Coordenador</Label>
                      <Select
                        value={coordinatorFilter}
                        onValueChange={(v) => {
                          setCoordinatorFilter(v === '_all' ? '' : v);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-coordinator">
                          <SelectValue placeholder="Todos os coordenadores" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Todos os coordenadores</SelectItem>
                          {uniqueCoordinators.map((coord) => (
                            <SelectItem key={coord} value={coord}>
                              {coord}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Client */}
                    <div className="space-y-2">
                      <Label className="font-medium">Cliente</Label>
                      <Select
                        value={clientFilter}
                        onValueChange={(v) => {
                          setClientFilter(v === '_all' ? '' : v);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-client">
                          <SelectValue placeholder="Todos os clientes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Todos os clientes</SelectItem>
                          {clients.slice(0, 100).map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.razaoSocial}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando propostas...</div>
        ) : filteredProposals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Nenhuma proposta encontrada</p>
              {(search || activeFilterCount > 0) && (
                <Button variant="ghost" onClick={clearAllFilters}>
                  Limpar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-1 min-h-0 overflow-hidden mt-4" ref={tableContainerRef}>
            <div className="h-full overflow-auto">
              <Table className="w-full">
                <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    {hasOverflowColumns && (
                      <TableHead className="w-12 px-2">
                        <span className="sr-only">Expandir</span>
                      </TableHead>
                    )}
                    {primaryColumns.map((col) => (
                      <TableHead 
                        key={col.id} 
                        className="text-xs font-medium whitespace-nowrap cursor-pointer select-none"
                        data-testid={`header-sort-${col.id}`}
                        onClick={() => handleSort(col.id)}
                      >
                        <div className="flex items-center">
                          {col.label}
                          {getSortIcon(col.id)}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProposals.map((proposal) => {
                    const isExpanded = expandedRows.has(proposal.id);
                    return (
                      <React.Fragment key={proposal.id}>
                        <TableRow
                          data-testid={`row-proposal-${proposal.id}`}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-muted/30' : 'hover:bg-muted/50'}`}
                          onClick={() => handleRowClick(proposal)}
                        >
                          {hasOverflowColumns && (
                            <TableCell className="w-12 px-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={(e) => toggleRowExpansion(proposal.id, e)}
                                data-testid={`button-expand-${proposal.id}`}
                                title={isExpanded ? 'Recolher' : 'Expandir para ver mais colunas'}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-primary" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </TableCell>
                          )}
                          {primaryColumns.map((col) => (
                            <TableCell key={col.id} className="text-sm py-3 truncate max-w-[200px]">
                              {getCellValue(proposal, col.id)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-edit-proposal-${proposal.id}`}
                                onClick={(e) => handleEditProposal(proposal, e)}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {hasOverflowColumns && isExpanded && (
                          <TableRow 
                            key={`${proposal.id}-expanded`}
                            className="bg-muted/20 border-b-2 border-primary/10"
                          >
                            <TableCell 
                              colSpan={primaryColumns.length + 2}
                              className="p-0"
                            >
                              <div className="px-6 py-4 animate-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                  {overflowColumns.map((col) => (
                                    <div 
                                      key={col.id}
                                      className="flex flex-col gap-1 p-3 rounded-lg bg-background/50 border border-border/50"
                                    >
                                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                        {col.label}
                                      </span>
                                      <span className="text-sm font-medium">
                                        {getCellValue(proposal, col.id)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Pagination */}
        {filteredProposals.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0 mt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Mostrando {startIndex + 1}-{Math.min(endIndex, filteredProposals.length)} de {filteredProposals.length}</span>
              <span className="mx-2">|</span>
              <span>Exibir</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-16 h-8" data-testid="select-items-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    data-testid={`button-page-${pageNum}`}
                    className="w-8"
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Detail Sheet (Side Panel) */}
        <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2">
                <span className="text-primary font-mono">{selectedProposal?.code}</span>
                {selectedProposal && (
                  <Badge className={`text-white ${statusColors[selectedProposal.status]}`}>
                    {statusLabels[selectedProposal.status]}
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription className="text-base font-medium text-foreground">
                {selectedProposal?.title}
              </SheetDescription>
            </SheetHeader>

            {selectedProposal && (
              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleEditProposal(selectedProposal)}
                    data-testid="button-edit-from-sheet"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  {selectedProposal.status === 'approved' && (
                    <Button
                      className="flex-1"
                      onClick={() => convertMutation.mutate(selectedProposal.id)}
                      disabled={convertMutation.isPending}
                      data-testid="button-convert-from-sheet"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Converter em Projeto
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Accordion Sections */}
                <Accordion type="multiple" defaultValue={['basic', 'client', 'values']} className="w-full">
                  {/* Basic Info */}
                  <AccordionItem value="basic">
                    <AccordionTrigger className="text-sm font-medium">
                      Informações Básicas
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Código</Label>
                          <p className="font-mono">{selectedProposal.code}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Revisão</Label>
                          <p>{selectedProposal.revision || 0}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo Proposta</Label>
                          <Badge variant="outline">{typeLabels[selectedProposal.type]}</Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo Atividade</Label>
                          <p>{selectedProposal.activityType || '-'}</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Descrição</Label>
                          <p className="text-sm">{selectedProposal.description || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Client */}
                  <AccordionItem value="client">
                    <AccordionTrigger className="text-sm font-medium">
                      Cliente
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Razão Social</Label>
                          <p className="font-medium">{selectedProposal.client?.razaoSocial || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">CNPJ</Label>
                          <p>{selectedProposal.client?.cnpj || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Guarda-chuva</Label>
                          <p>{selectedProposal.umbrellaRef || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Values */}
                  <AccordionItem value="values">
                    <AccordionTrigger className="text-sm font-medium">
                      Valores
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="col-span-2 bg-primary/10 rounded-lg p-3">
                          <Label className="text-xs text-muted-foreground">Valor Total</Label>
                          <p className="text-xl font-bold text-primary">{formatCurrency(selectedProposal.totalValue)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Quantidade</Label>
                          <p>{selectedProposal.quantity || 0}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Horas Estimadas</Label>
                          <p>{selectedProposal.estimatedHours || 0}h</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Justif. Horas</Label>
                          <p>{formatCurrency(selectedProposal.hourJustification)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Reabilitação</Label>
                          <p>{formatCurrency(selectedProposal.rehabilitation)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Subcontratada</Label>
                          <p>{formatCurrency(selectedProposal.subcontracted)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Liv. Pagto</Label>
                          <p>{formatCurrency(selectedProposal.paymentBook)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Despesa</Label>
                          <p>{formatCurrency(selectedProposal.expense)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Aditivo</Label>
                          <p>{formatCurrency(selectedProposal.additiveValue)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Recurso</Label>
                          <p>{formatCurrency(selectedProposal.resource)}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* People */}
                  <AccordionItem value="people">
                    <AccordionTrigger className="text-sm font-medium">
                      Responsáveis
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Coordenador</Label>
                          <p>{selectedProposal.coordinatorName || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Especialista</Label>
                          <p>{selectedProposal.specialist || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Enviado por</Label>
                          <p>{selectedProposal.sentByName || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Dates */}
                  <AccordionItem value="dates">
                    <AccordionTrigger className="text-sm font-medium">
                      Datas
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Criação</Label>
                          <p>{formatDate(selectedProposal.createdAt)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Atualização</Label>
                          <p>{formatDate(selectedProposal.updatedAt)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Envio</Label>
                          <p>{formatDate(selectedProposal.sentDate)}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Classification */}
                  <AccordionItem value="classification">
                    <AccordionTrigger className="text-sm font-medium">
                      Classificação
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo Principal</Label>
                          <p>{selectedProposal.mainType || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Utilidade</Label>
                          <p>{selectedProposal.utility || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">OAs</Label>
                          <p>{selectedProposal.workOrders || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Proposta - {selectedProposal?.code}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Título *</Label>
                <Input
                  id="edit-title"
                  data-testid="input-edit-proposal-title"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrição</Label>
                <Textarea
                  id="edit-description"
                  data-testid="input-edit-proposal-description"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    value={editFormData.clientId}
                    onValueChange={(value) => setEditFormData({ ...editFormData, clientId: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-client">
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.razaoSocial}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={editFormData.type}
                    onValueChange={(value) => setEditFormData({ ...editFormData, type: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_price">Preço Fixo</SelectItem>
                      <SelectItem value="appropriation">Apropriação</SelectItem>
                      <SelectItem value="umbrella">Guarda-Chuva</SelectItem>
                      <SelectItem value="service_order">Ordem de Serviço</SelectItem>
                      <SelectItem value="additive">Aditivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-totalValue">Valor Total (R$)</Label>
                  <Input
                    id="edit-totalValue"
                    type="number"
                    step="0.01"
                    data-testid="input-edit-proposal-value"
                    value={editFormData.totalValue}
                    onChange={(e) => setEditFormData({ ...editFormData, totalValue: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-estimatedHours">Horas Estimadas</Label>
                  <Input
                    id="edit-estimatedHours"
                    type="number"
                    data-testid="input-edit-proposal-hours"
                    value={editFormData.estimatedHours}
                    onChange={(e) => setEditFormData({ ...editFormData, estimatedHours: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-coordinatorName">Coordenador</Label>
                  <Input
                    id="edit-coordinatorName"
                    data-testid="input-edit-proposal-coordinator"
                    value={editFormData.coordinatorName}
                    onChange={(e) => setEditFormData({ ...editFormData, coordinatorName: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" data-testid="button-save-edit-proposal" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {selectedProposal && (
          <CategoryValuesDrawer
            open={categoryDrawerOpen}
            onOpenChange={setCategoryDrawerOpen}
            proposalId={selectedProposal.id}
            proposalCode={selectedProposal.code}
          />
        )}
      </div>
    </Layout>
  );
}
