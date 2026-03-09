import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ArrowRight, ChevronLeft, ChevronRight, Pencil, RotateCcw, Settings2, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Calendar, SlidersHorizontal, ChevronDown, ChevronUp, Check, Star, Maximize2, Minimize2, PanelRightClose, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { proposalsApi, clientsApi, authApi, favoritesApi, usersApi, proposalExpensesApi, proposalAdditivesApi, Proposal, Client, UserOption, ProposalExpenseItem, ProposalExpensesResponse, ProposalAdditiveItem, ProposalAdditivesResponse } from '@/lib/api';
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
  // New (legacy) statuses (aligned with the screenshot)
  em_elaboracao: 'bg-gray-500',
  em_analise: 'bg-yellow-500',
  com_sucesso: 'bg-green-500',
  sucesso_aditivo: 'bg-teal-500',
  nao_sucesso: 'bg-red-500',
  cancelada: 'bg-gray-400',
  declinio: 'bg-red-500',

  // Backward compatibility (old statuses)
  draft: 'bg-gray-500',
  in_review: 'bg-yellow-500',
  sent: 'bg-yellow-500',
  negotiating: 'bg-yellow-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  cancelled: 'bg-gray-400',
  converted: 'bg-green-500',
};

const statusLabels: Record<string, string> = {
  // New (legacy) statuses
  em_elaboracao: 'Em elaboração',
  em_analise: 'Em análise',
  com_sucesso: 'Sucesso',
  sucesso_aditivo: 'Sucesso (aditivo)',
  nao_sucesso: 'Não sucesso',
  cancelada: 'Cancelada',
  declinio: 'Declínio',

  // Backward compatibility (old statuses)
  draft: 'Em elaboração',
  in_review: 'Em análise',
  sent: 'Em análise',
  negotiating: 'Em análise',
  approved: 'Sucesso',
  rejected: 'Não sucesso',
  cancelled: 'Cancelada',
  converted: 'Sucesso',
};

const proposalStatusOptions: Array<{ value: string; label: string }> = [
  { value: 'em_elaboracao', label: 'Em elaboração' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'com_sucesso', label: 'Sucesso' },
  { value: 'sucesso_aditivo', label: 'Sucesso (aditivo)' },
  { value: 'nao_sucesso', label: 'Não sucesso' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'declinio', label: 'Declínio' },
];

const mainTypeOptions: string[] = [
  'ATO/Fiscalização de campo',
  'Acessos',
  'Auditoria/Inspeção Segurança/Avaliações de Segurança/Laudos de Estabilidade',
  'Barragens/Diques/Ponds/Bacias/Disposição de rejeitos',
  'Caracterização Geológico-Geotécnica/Hidrogeologia',
  'Depósito de Rejeito - Empilhamento',
  'Descomissionamento/Descaracterização',
  'Estudos Ambientais',
  'Estudos Hidráulicos/Hidrológicos',
  'Estudos de ruptura/PAE/PSB/Análise de risco',
  'Estudos Hidráulicos/Hidrológicos/Drenagem',
  'Guarda-chuva',
  'Pilha de Estéril/Minério',
  'Subcontratação',
  'Taludes (exceto cava)',
  'Taludes Cava/Lavra subterrânea',
  'Geral',
];

const typeLabels: Record<string, string> = {
  fixed_price: 'Preço fechado',
  appropriation: 'Preço sob demanda',
  umbrella: 'Guarda-chuva',
  service_order: 'Ordem de serviço',
  additive: 'Aditivo',
};

const proposalTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'fixed_price', label: typeLabels.fixed_price },
  { value: 'appropriation', label: typeLabels.appropriation },
  { value: 'umbrella', label: typeLabels.umbrella },
  { value: 'service_order', label: typeLabels.service_order },
];

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width?: string;
  category: 'basic' | 'classification' | 'values' | 'dates' | 'people';
}

const COLUMNS_VERSION = 6;

const defaultColumns: ColumnConfig[] = [
  { id: 'code', label: 'Código da proposta', visible: true, width: 'min-w-[90px]', category: 'basic' },
  { id: 'revision', label: 'Revisão', visible: true, width: 'min-w-[50px]', category: 'basic' },
  { id: 'proposalOrigin', label: 'Cód. proposta antigo', visible: false, width: 'min-w-[70px]', category: 'basic' },
  { id: 'type', label: 'Tipo do contrato', visible: true, width: 'min-w-[90px]', category: 'classification' },
  { id: 'client', label: 'Cliente', visible: true, width: 'min-w-[120px]', category: 'basic' },
  { id: 'umbrellaRef', label: 'Proposta original (guarda-chuva)', visible: false, width: 'min-w-[100px]', category: 'classification' },
  { id: 'coordinatorName', label: 'Responsável pela proposta', visible: true, width: 'min-w-[100px]', category: 'people' },
  { id: 'title', label: 'Título', visible: true, width: 'min-w-[150px]', category: 'basic' },
  { id: 'createdAt', label: 'Data de solicitação', visible: false, width: 'min-w-[80px]', category: 'dates' },
  { id: 'sentDate', label: 'Data de emissão', visible: true, width: 'min-w-[80px]', category: 'dates' },
  { id: 'dueDate', label: 'Data de validade', visible: false, width: 'min-w-[80px]', category: 'dates' },
  { id: 'updatedAt', label: 'Data de atualização', visible: false, width: 'w-28', category: 'dates' },
  { id: 'status', label: 'Situação', visible: true, width: 'min-w-[80px]', category: 'basic' },
  { id: 'expectation', label: 'Expectativa', visible: false, width: 'min-w-[80px]', category: 'values' },
  { id: 'mainType', label: 'Tipo principal', visible: false, width: 'min-w-[90px]', category: 'classification' },
  { id: 'termMonths', label: 'Prazo (em meses)', visible: false, width: 'min-w-[70px]', category: 'values' },
  { id: 'riskAssessment', label: 'Aval. do risco', visible: false, width: 'min-w-[70px]', category: 'values' },
  { id: 'acquisitionMargin', label: '% contratação', visible: false, width: 'min-w-[70px]', category: 'values' },
  { id: 'additiveValue', label: 'Aditivos', visible: false, width: 'min-w-[60px]', category: 'values' },
  { id: 'expense', label: 'Despesas', visible: false, width: 'min-w-[60px]', category: 'values' },
  { id: 'discount', label: 'Valor do desconto', visible: false, width: 'min-w-[60px]', category: 'values' },
  { id: 'subcontracted', label: 'Vl. sub proposta', visible: false, width: 'min-w-[80px]', category: 'values' },
  { id: 'quantity', label: 'Qtd proposta', visible: false, width: 'min-w-[70px]', category: 'values' },
  { id: 'categoryValues', label: 'Valores por categoria', visible: false, width: 'w-32', category: 'values' },
  { id: 'contractCode', label: 'Código do contrato', visible: false, width: 'w-28', category: 'basic' },
  { id: 'workOrders', label: 'OAs', visible: false, width: 'w-20', category: 'basic' },
  { id: 'totalValue', label: 'Valor total da proposta', visible: false, width: 'w-32', category: 'values' },
  { id: 'description', label: 'Observação', visible: false, width: 'min-w-[80px]', category: 'basic' },
];

const categoryLabels: Record<string, string> = {
  basic: 'Informações Básicas',
  classification: 'Classificação',
  values: 'Valores',
  dates: 'Datas',
  people: 'Responsáveis',
};

export default function Proposals() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getUserStorageKey = useCallback((baseKey: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return `${baseKey}:anonymous`;

      const parts = token.split('.');
      if (parts.length < 2) return `${baseKey}:anonymous`;

      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
      const json = atob(padded);
      const payload = JSON.parse(json) as { sub?: string };
      const sub = typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : 'anonymous';
      return `${baseKey}:${sub}`;
    } catch {
      return `${baseKey}:anonymous`;
    }
  }, []);

  const observationSizeStorageKey = useMemo(
    () => getUserStorageKey('proposalObservationTextareaSize'),
    [getUserStorageKey]
  );

  // ~2 linhas de texto (line-height + padding do textarea)
  const OBSERVATION_MIN_HEIGHT_PX = 56;
  const OBSERVATION_MAX_HEIGHT_PX = 320;

  const clampObservationHeight = useCallback((height: number) => {
    if (!Number.isFinite(height)) return OBSERVATION_MIN_HEIGHT_PX;
    return Math.min(OBSERVATION_MAX_HEIGHT_PX, Math.max(OBSERVATION_MIN_HEIGHT_PX, height));
  }, []);

  const [observationTextareaSize, setObservationTextareaSize] = useState<{ height?: number }>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(observationSizeStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const height = typeof parsed?.height === 'number' && Number.isFinite(parsed.height) ? parsed.height : undefined;
      if (height) {
        setObservationTextareaSize({ height: clampObservationHeight(height) });
      }
    } catch {
      // ignore
    }
  }, [clampObservationHeight, observationSizeStorageKey]);

  const persistObservationTextareaSize = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return;

      const height = el.offsetHeight;

      if (!Number.isFinite(height) || height <= 0) return;

      const next = { height: clampObservationHeight(height) };
      setObservationTextareaSize(next);
      try {
        localStorage.setItem(observationSizeStorageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [clampObservationHeight, observationSizeStorageKey]
  );

  const observationTextareaStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {
      width: '100%',
      boxSizing: 'border-box',
      display: 'block',
      minHeight: `${OBSERVATION_MIN_HEIGHT_PX}px`,
      maxHeight: `${OBSERVATION_MAX_HEIGHT_PX}px`,
    };
    if (typeof observationTextareaSize.height === 'number') style.height = `${observationTextareaSize.height}px`;
    return style;
  }, [OBSERVATION_MAX_HEIGHT_PX, OBSERVATION_MIN_HEIGHT_PX, observationTextareaSize.height]);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [expensesDialogOpen, setExpensesDialogOpen] = useState(false);
  const [additivesDialogOpen, setAdditivesDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [expensesProposal, setExpensesProposal] = useState<Proposal | null>(null);
  const [additivesProposal, setAdditivesProposal] = useState<Proposal | null>(null);
  const [expenseForm, setExpenseForm] = useState<{ description: string; value: string; reimbursable: boolean }>({
    description: '',
    value: '',
    reimbursable: false,
  });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseInitial, setEditingExpenseInitial] = useState<{
    description: string;
    value: number;
    reimbursable: boolean;
  } | null>(null);

  const [additiveForm, setAdditiveForm] = useState<{ termMonths: string; subcontractValue: string; mobilizationValue: string; readjustValue: string }>({
    termMonths: '',
    subcontractValue: '',
    mobilizationValue: '',
    readjustValue: '',
  });
  const [editingAdditiveId, setEditingAdditiveId] = useState<string | null>(null);
  const [editingAdditiveInitial, setEditingAdditiveInitial] = useState<{
    termMonths: number | null;
    subcontractValue: number;
    mobilizationValue: number;
    readjustValue: number;
  } | null>(null);

  const [expensesItemsPage, setExpensesItemsPage] = useState(1);
  const [expensesItemsPerPage, setExpensesItemsPerPage] = useState<number>(5);
  const [additivesItemsPage, setAdditivesItemsPage] = useState(1);
  const [additivesItemsPerPage, setAdditivesItemsPerPage] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);

  const expensesProposalId = expensesProposal?.id;
  const expensesQueryKey = expensesProposalId
    ? ['/api/proposals', expensesProposalId, 'expenses']
    : ['/api/proposals', 'expenses'];

  const { data: expensesData, isLoading: expensesLoading } = useQuery<ProposalExpensesResponse>({
    queryKey: expensesQueryKey,
    queryFn: () => proposalExpensesApi.list(expensesProposalId as string),
    enabled: expensesDialogOpen && Boolean(expensesProposalId),
  });

  const expensesItems = expensesData?.items ?? [];
  const safeExpensesItemsPerPage = [5, 10, 15].includes(expensesItemsPerPage) ? expensesItemsPerPage : 5;
  const expensesItemsTotalPages = Math.max(1, Math.ceil(expensesItems.length / safeExpensesItemsPerPage));
  const expensesItemsStartIndex = (expensesItemsPage - 1) * safeExpensesItemsPerPage;
  const expensesItemsEndIndex = expensesItemsStartIndex + safeExpensesItemsPerPage;
  const visibleExpensesItems = expensesItems.slice(expensesItemsStartIndex, expensesItemsEndIndex);

  useEffect(() => {
    if (expensesItemsPage > expensesItemsTotalPages) {
      setExpensesItemsPage(expensesItemsTotalPages);
    }
  }, [expensesItemsPage, expensesItemsTotalPages]);

  const additivesProposalId = additivesProposal?.id;
  const additivesQueryKey = additivesProposalId
    ? ['/api/proposals', additivesProposalId, 'additives']
    : ['/api/proposals', 'additives'];

  const { data: additivesData, isLoading: additivesLoading } = useQuery<ProposalAdditivesResponse>({
    queryKey: additivesQueryKey,
    queryFn: () => proposalAdditivesApi.list(additivesProposalId as string),
    enabled: additivesDialogOpen && Boolean(additivesProposalId),
  });

  const additivesItems = additivesData?.items ?? [];
  const safeAdditivesItemsPerPage = [5, 10, 15].includes(additivesItemsPerPage) ? additivesItemsPerPage : 5;
  const additivesItemsTotalPages = Math.max(1, Math.ceil(additivesItems.length / safeAdditivesItemsPerPage));
  const additivesItemsStartIndex = (additivesItemsPage - 1) * safeAdditivesItemsPerPage;
  const additivesItemsEndIndex = additivesItemsStartIndex + safeAdditivesItemsPerPage;
  const visibleAdditivesItems = additivesItems.slice(additivesItemsStartIndex, additivesItemsEndIndex);

  useEffect(() => {
    if (additivesItemsPage > additivesItemsTotalPages) {
      setAdditivesItemsPage(additivesItemsTotalPages);
    }
  }, [additivesItemsPage, additivesItemsTotalPages]);

  useEffect(() => {
    if (!additivesDialogOpen) {
      setAdditiveForm({ termMonths: '', subcontractValue: '', mobilizationValue: '', readjustValue: '' });
      setEditingAdditiveId(null);
      setEditingAdditiveInitial(null);
      setAdditivesItemsPage(1);
      return;
    }

    setAdditiveForm({ termMonths: '', subcontractValue: '', mobilizationValue: '', readjustValue: '' });
    setEditingAdditiveId(null);
    setEditingAdditiveInitial(null);
    setAdditivesItemsPage(1);
  }, [additivesDialogOpen, additivesProposalId]);

  useEffect(() => {
    if (!expensesDialogOpen) {
      setExpenseForm({ description: '', value: '', reimbursable: false });
      setEditingExpenseId(null);
      setEditingExpenseInitial(null);
      setExpensesItemsPage(1);
      return;
    }

    // When opening for a different proposal, reset form state.
    setExpenseForm({ description: '', value: '', reimbursable: false });
    setEditingExpenseId(null);
    setEditingExpenseInitial(null);
    setExpensesItemsPage(1);
  }, [expensesDialogOpen, expensesProposalId]);

  const createExpenseMutation = useMutation({
    mutationFn: async (input: { proposalId: string; description: string; value: number; reimbursable: boolean }) => {
      return proposalExpensesApi.create(input.proposalId, {
        description: input.description,
        value: input.value,
        reimbursable: input.reimbursable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      setExpenseForm({ description: '', value: '', reimbursable: false });
      setEditingExpenseId(null);
      setEditingExpenseInitial(null);
      toast({ title: 'Despesa adicionada', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar despesa', description: error.message, variant: 'destructive' });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async (input: { proposalId: string; expenseId: string; description: string; value: number; reimbursable: boolean }) => {
      return proposalExpensesApi.update(input.proposalId, input.expenseId, {
        description: input.description,
        value: input.value,
        reimbursable: input.reimbursable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      setExpenseForm({ description: '', value: '', reimbursable: false });
      setEditingExpenseId(null);
      setEditingExpenseInitial(null);
      toast({ title: 'Despesa atualizada', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar despesa', description: error.message, variant: 'destructive' });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (input: { proposalId: string; expenseId: string }) => {
      return proposalExpensesApi.delete(input.proposalId, input.expenseId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Despesa removida', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover despesa', description: error.message, variant: 'destructive' });
    },
  });

  const createAdditiveMutation = useMutation({
    mutationFn: async (input: { proposalId: string; termMonths: number | null; subcontractValue: number; mobilizationValue: number; readjustValue: number }) => {
      return proposalAdditivesApi.create(input.proposalId, {
        termMonths: input.termMonths,
        subcontractValue: input.subcontractValue,
        mobilizationValue: input.mobilizationValue,
        readjustValue: input.readjustValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: additivesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      setAdditiveForm({ termMonths: '', subcontractValue: '', mobilizationValue: '', readjustValue: '' });
      setEditingAdditiveId(null);
      setEditingAdditiveInitial(null);
      toast({ title: 'Aditivo adicionado', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar aditivo', description: error.message, variant: 'destructive' });
    },
  });

  const updateAdditiveMutation = useMutation({
    mutationFn: async (input: { proposalId: string; additiveId: string; termMonths: number | null; subcontractValue: number; mobilizationValue: number; readjustValue: number }) => {
      return proposalAdditivesApi.update(input.proposalId, input.additiveId, {
        termMonths: input.termMonths,
        subcontractValue: input.subcontractValue,
        mobilizationValue: input.mobilizationValue,
        readjustValue: input.readjustValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: additivesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      setAdditiveForm({ termMonths: '', subcontractValue: '', mobilizationValue: '', readjustValue: '' });
      setEditingAdditiveId(null);
      setEditingAdditiveInitial(null);
      toast({ title: 'Aditivo atualizado', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar aditivo', description: error.message, variant: 'destructive' });
    },
  });

  const deleteAdditiveMutation = useMutation({
    mutationFn: async (input: { proposalId: string; additiveId: string }) => {
      return proposalAdditivesApi.delete(input.proposalId, input.additiveId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: additivesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Aditivo removido', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover aditivo', description: error.message, variant: 'destructive' });
    },
  });

  const formatMoneyMask = useCallback((input: string): string => {
    const digits = input.replace(/\D/g, '');
    if (!digits) return '';

    const value = Number(digits) / 100;
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const formatMoneyFromValue = useCallback((value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return '';

      // Accept both "1500.00" and "1.500,00"
      const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;
      const num = Number(normalized);
      if (!Number.isFinite(num)) return '';
      return num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    return '';
  }, []);

  const parseMoneyMaskToNumber = useCallback((masked: string): number | null => {
    const digits = masked.replace(/\D/g, '');
    if (!digits) return null;
    const value = Number(digits) / 100;
    return Number.isFinite(value) ? value : null;
  }, []);

  const isEditingExpenseDirty = useMemo(() => {
    if (!editingExpenseId || !editingExpenseInitial) return false;

    const description = expenseForm.description.trim();
    const value = parseMoneyMaskToNumber(expenseForm.value.trim());
    const reimbursable = Boolean(expenseForm.reimbursable);

    if (description !== editingExpenseInitial.description) return true;
    if ((value ?? null) !== editingExpenseInitial.value) return true;
    if (reimbursable !== editingExpenseInitial.reimbursable) return true;

    return false;
  }, [editingExpenseId, editingExpenseInitial, expenseForm.description, expenseForm.value, expenseForm.reimbursable, parseMoneyMaskToNumber]);

  const expenseSubmitDisabledReason = useMemo(() => {
    if (createExpenseMutation.isPending || updateExpenseMutation.isPending) return 'Salvando...';

    const description = expenseForm.description.trim();
    const value = parseMoneyMaskToNumber(expenseForm.value.trim());

    if (!description) return 'Preencha a descrição.';
    if (value === null) return 'Preencha o valor.';

    if (editingExpenseId) {
      if (!isEditingExpenseDirty) return 'Nenhuma alteração para salvar.';
    }

    return null;
  }, [createExpenseMutation.isPending, updateExpenseMutation.isPending, expenseForm.description, expenseForm.value, parseMoneyMaskToNumber, editingExpenseId, isEditingExpenseDirty]);

  const parseTermMonthsInput = useCallback((raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    const intValue = Math.trunc(num);
    if (intValue < 0) return null;
    return intValue;
  }, []);

  const parseMoneyMaskOrZero = useCallback((masked: string): number | null => {
    const trimmed = masked.trim();
    if (!trimmed) return 0;
    return parseMoneyMaskToNumber(trimmed);
  }, [parseMoneyMaskToNumber]);

  const isEditingAdditiveDirty = useMemo(() => {
    if (!editingAdditiveId || !editingAdditiveInitial) return false;

    const termMonths = parseTermMonthsInput(additiveForm.termMonths);
    const subcontractValue = parseMoneyMaskOrZero(additiveForm.subcontractValue);
    const mobilizationValue = parseMoneyMaskOrZero(additiveForm.mobilizationValue);
    const readjustValue = parseMoneyMaskOrZero(additiveForm.readjustValue);

    if ((termMonths ?? null) !== (editingAdditiveInitial.termMonths ?? null)) return true;
    if ((subcontractValue ?? null) !== editingAdditiveInitial.subcontractValue) return true;
    if ((mobilizationValue ?? null) !== editingAdditiveInitial.mobilizationValue) return true;
    if ((readjustValue ?? null) !== editingAdditiveInitial.readjustValue) return true;

    return false;
  }, [additiveForm.mobilizationValue, additiveForm.readjustValue, additiveForm.subcontractValue, additiveForm.termMonths, editingAdditiveId, editingAdditiveInitial, parseMoneyMaskOrZero, parseTermMonthsInput]);

  const additiveSubmitDisabledReason = useMemo(() => {
    if (createAdditiveMutation.isPending || updateAdditiveMutation.isPending) return 'Salvando...';

    const termMonthsRaw = additiveForm.termMonths.trim();
    const subcontractRaw = additiveForm.subcontractValue.trim();
    const mobilizationRaw = additiveForm.mobilizationValue.trim();
    const readjustRaw = additiveForm.readjustValue.trim();

    const termMonths = parseTermMonthsInput(termMonthsRaw);
    if (termMonthsRaw && termMonths === null) return 'Prazo inválido.';

    const subcontractValue = parseMoneyMaskOrZero(subcontractRaw);
    const mobilizationValue = parseMoneyMaskOrZero(mobilizationRaw);
    const readjustValue = parseMoneyMaskOrZero(readjustRaw);

    if (subcontractRaw && subcontractValue === null) return 'Valor de subcontratação inválido.';
    if (mobilizationRaw && mobilizationValue === null) return 'Valor de mobilização inválido.';
    if (readjustRaw && readjustValue === null) return 'Valor de reajuste inválido.';

    const hasAnyValue =
      termMonths !== null ||
      Boolean(subcontractRaw) ||
      Boolean(mobilizationRaw) ||
      Boolean(readjustRaw);

    if (!editingAdditiveId && !hasAnyValue) return 'Preencha ao menos um campo.';

    if (editingAdditiveId) {
      if (!isEditingAdditiveDirty) return 'Nenhuma alteração para salvar.';
    }

    return null;
  }, [additiveForm.mobilizationValue, additiveForm.readjustValue, additiveForm.subcontractValue, additiveForm.termMonths, createAdditiveMutation.isPending, editingAdditiveId, isEditingAdditiveDirty, parseMoneyMaskOrZero, parseTermMonthsInput, updateAdditiveMutation.isPending]);

  useEffect(() => {
    const queryString = location.split('?')[1] ?? '';
    const params = new URLSearchParams(queryString);
    setSearch(params.get('search') ?? '');
  }, [location]);
    
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
    type: 'fixed_price',
    umbrellaRef: '',
    clientId: '',
    coordinatorName: '',
    title: '',
    createdAt: '',
    sentDate: '',
    dueDate: '',
    status: 'em_elaboracao',
    expectation: '',
    mainType: '',
    termMonths: '',
    riskAssessment: 'Não',
    hourJustification: '',
    subcontracted: '',
    discount: '',
    coordinatorId: '',
    description: '',
    proposalOrigin: '',
  });

  type EditFormData = typeof editFormData;
  type EditFormField = keyof EditFormData;

  const editInitialRef = useRef<EditFormData | null>(null);
  const [editTouched, setEditTouched] = useState<Partial<Record<EditFormField, boolean>>>({});
  const [editAttemptedSubmit, setEditAttemptedSubmit] = useState(false);

  const isEditDirty = useMemo(() => {
    if (!editDialogOpen) return false;
    const initial = editInitialRef.current;
    if (!initial) return false;
    return JSON.stringify(initial) !== JSON.stringify(editFormData);
  }, [editDialogOpen, editFormData]);

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
  const [conversionFilter, setConversionFilter] = useState<'all' | 'converted' | 'not_converted'>('all');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

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
    setConversionFilter('all');
    setShowOnlyFavorites(false);
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
    (clientFilter ? 1 : 0) +
    (conversionFilter !== 'all' ? 1 : 0);

  // Load column preferences from server on mount
  useEffect(() => {
    const mergeColumns = (savedColumns: ColumnConfig[]) => {
      const savedMap = new Map(savedColumns.map(c => [c.id, c]));
      const merged = defaultColumns.map(defaultCol => {
        const saved = savedMap.get(defaultCol.id);
        if (saved) {
          return { ...defaultCol, visible: saved.visible };
        }
        return defaultCol;
      });
      return merged;
    };

    const token = localStorage.getItem('token');
    const savedVersion = localStorage.getItem('proposalColumnsVersion');
    
    if (savedVersion !== String(COLUMNS_VERSION)) {
      localStorage.setItem('proposalColumnsVersion', String(COLUMNS_VERSION));
      localStorage.removeItem('proposalColumns');
      setColumns(defaultColumns);
      return;
    }
    
    if (token) {
      authApi.getPreferences()
        .then((prefs) => {
          if (prefs.proposalColumns && Array.isArray(prefs.proposalColumns)) {
            setColumns(mergeColumns(prefs.proposalColumns));
          }
        })
        .catch(() => {
          const savedColumns = localStorage.getItem('proposalColumns');
          if (savedColumns) {
            try {
              const parsed = JSON.parse(savedColumns);
              setColumns(mergeColumns(parsed));
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

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;

    const update = () => setTableViewportWidth(viewport.getBoundingClientRect().width);
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  const estimateColumnWidthPx = (widthClass?: string) => {
    if (!widthClass) return 120;
    const minPx = widthClass.match(/min-w-\[(\d+)px\]/);
    if (minPx) return Number(minPx[1]);
    const wPx = widthClass.match(/\bw-\[(\d+)px\]\b/);
    if (wPx) return Number(wPx[1]);
    const wScale = widthClass.match(/\bw-(\d+)\b/);
    if (wScale) return Number(wScale[1]) * 4;
    return 120;
  };

  const COLUMN_CELL_PADDING_PX = 32; // p-4 / px-4
  const STATUS_COLUMN_ID = 'status';

  // Split columns dynamically to avoid shrinking columns (no horizontal scroll)
  const MAX_PRIMARY_COLUMNS = 10;
  const { primaryColumns, overflowColumns, hasOverflowColumns } = useMemo(() => {
    const statusCol = visibleColumns.find((c) => c.id === STATUS_COLUMN_ID);
    const otherCols = visibleColumns.filter((c) => c.id !== STATUS_COLUMN_ID);
    const primaryCapacityForOthers = Math.max(0, MAX_PRIMARY_COLUMNS - (statusCol ? 1 : 0));

    const fallbackPrimary = [
      ...otherCols.slice(0, primaryCapacityForOthers),
      ...(statusCol ? [statusCol] : []),
    ];
    const fallbackOverflow = otherCols.slice(primaryCapacityForOthers);

    if (!tableViewportWidth) {
      return {
        primaryColumns: fallbackPrimary,
        overflowColumns: fallbackOverflow,
        hasOverflowColumns: fallbackOverflow.length > 0,
      };
    }

    const favoriteWidth = 40;
    const actionsWidth = 96;
    const expandWidth = 48;
    const paddingFudge = 32;

    const compute = (includeExpand: boolean) => {
      const reserved = favoriteWidth + actionsWidth + paddingFudge + (includeExpand ? expandWidth : 0);
      const available = Math.max(0, tableViewportWidth - reserved);

      const statusWidth = statusCol ? estimateColumnWidthPx(statusCol.width) + COLUMN_CELL_PADDING_PX : 0;
      const availableForOthers = Math.max(0, available - statusWidth);
      const primaryOtherCapacity = Math.max(0, MAX_PRIMARY_COLUMNS - (statusCol ? 1 : 0));

      const primaryOthers: ColumnConfig[] = [];
      const overflow: ColumnConfig[] = [];
      let used = 0;

      const DATE_COL_IDS = ['createdAt', 'sentDate', 'dueDate', 'updatedAt'] as const;
      const dateCols: ColumnConfig[] = DATE_COL_IDS
        .map((id) => otherCols.find((c) => c.id === id))
        .filter(Boolean) as ColumnConfig[];
      const nonDateCols = otherCols.filter((c) => !DATE_COL_IDS.includes(c.id as any));

      const pushCols = (cols: ColumnConfig[], opts?: { maxCount?: number; maxWidth?: number }) => {
        const maxCount = opts?.maxCount ?? Number.POSITIVE_INFINITY;
        const maxWidth = opts?.maxWidth ?? availableForOthers;

        for (const col of cols) {
          const colWidth = estimateColumnWidthPx(col.width) + COLUMN_CELL_PADDING_PX;

          if (primaryOthers.length >= primaryOtherCapacity || primaryOthers.length >= maxCount) {
            overflow.push(col);
            continue;
          }

          if (primaryOthers.length === 0 || used + colWidth <= maxWidth) {
            primaryOthers.push(col);
            used += colWidth;
          } else {
            overflow.push(col);
          }
        }
      };

      if (dateCols.length === 0) {
        pushCols(otherCols);
      } else {
        const dateBlockWidth = dateCols.reduce(
          (acc, col) => acc + estimateColumnWidthPx(col.width) + COLUMN_CELL_PADDING_PX,
          0
        );

        const canKeepAllDatesInPrimary = dateCols.length <= primaryOtherCapacity && dateBlockWidth <= availableForOthers;

        if (canKeepAllDatesInPrimary) {
          const nonDateCountLimit = Math.max(0, primaryOtherCapacity - dateCols.length);
          const availableForNonDates = Math.max(0, availableForOthers - dateBlockWidth);

          pushCols(nonDateCols, { maxCount: nonDateCountLimit, maxWidth: availableForNonDates });
          primaryOthers.push(...dateCols);
        } else {
          pushCols(nonDateCols);
          overflow.unshift(...dateCols);
        }
      }

      const primary = [...primaryOthers, ...(statusCol ? [statusCol] : [])];

      return { primary, overflow };
    };

    let { primary, overflow } = compute(false);
    if (overflow.length > 0) {
      ({ primary, overflow } = compute(true));
    }

    return { primaryColumns: primary, overflowColumns: overflow, hasOverflowColumns: overflow.length > 0 };
  }, [visibleColumns, tableViewportWidth]);

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

  const latestRevisionByCode = useMemo(() => {
    const map = new Map<string, number>();
    proposals.forEach((p) => {
      const code = String(p.code || '').trim();
      if (!code) return;
      const rev = typeof (p as any).revision === 'number' ? (p as any).revision : Number((p as any).revision) || 0;
      const current = map.get(code);
      if (current === undefined || rev > current) {
        map.set(code, rev);
      }
    });
    return map;
  }, [proposals]);

  const isLatestRevision = (proposal: Proposal) => {
    const code = String(proposal.code || '').trim();
    const latest = latestRevisionByCode.get(code);
    const rev = typeof (proposal as any).revision === 'number' ? (proposal as any).revision : Number((proposal as any).revision) || 0;
    return latest === undefined ? true : rev >= latest;
  };

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['/api/users'],
    queryFn: () => usersApi.list(),
  });

  const activeUserNames = useMemo(() => {
    return new Set(
      users
        .filter((u) => u.isActive)
        .map((u) => (u.name || '').trim())
        .filter(Boolean)
    );
  }, [users]);

  const userNameById = useMemo(() => {
    return new Map(users.map((u) => [u.id, u.name] as const));
  }, [users]);

  const validateEditForm = (data: EditFormData) => {
    const errors: Partial<Record<EditFormField, string>> = {};

    if (!data.type) errors.type = 'Campo obrigatório';
    if (data.type === 'service_order' && !data.umbrellaRef) errors.umbrellaRef = 'Campo obrigatório';
    if (!data.clientId) errors.clientId = 'Campo obrigatório';
    if (!data.coordinatorName) {
      errors.coordinatorName = 'Campo obrigatório';
    } else if (activeUserNames.size > 0 && !activeUserNames.has(String(data.coordinatorName).trim())) {
      errors.coordinatorName = 'Selecione um responsável';
    }
    if (!data.title?.trim()) errors.title = 'Campo obrigatório';
    if (!data.riskAssessment) errors.riskAssessment = 'Campo obrigatório';

    return errors;
  };

  const editValidationErrors = useMemo(
    () => validateEditForm(editFormData),
    [editFormData, activeUserNames]
  );
  const isEditValid = Object.keys(editValidationErrors).length === 0;

  const shouldShowEditError = (field: EditFormField) =>
    Boolean(editValidationErrors[field]) && (editAttemptedSubmit || Boolean(editTouched[field]));

  const { data: favorites = [] } = useQuery<string[]>({
    queryKey: ['/api/proposal-favorites'],
    queryFn: () => favoritesApi.getAll(),
  });

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ proposalId, isFavorite }: { proposalId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        return favoritesApi.remove(proposalId);
      } else {
        return favoritesApi.add(proposalId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-favorites'] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar favorito', description: error.message, variant: 'destructive' });
    },
  });

  const handleToggleFavorite = (proposalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFavorite = favoritesSet.has(proposalId);
    toggleFavoriteMutation.mutate({ proposalId, isFavorite });
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<Proposal>) => proposalsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Proposta criada com sucesso', variant: 'success' });
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
      toast({ title: 'Proposta convertida em projeto com sucesso', variant: 'success' });
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
      toast({ title: 'Proposta atualizada com sucesso', variant: 'success' });
      setEditDialogOpen(false);
      setSelectedProposal(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar proposta', description: error.message, variant: 'destructive' });
    },
  });

  const deleteProposalMutation = useMutation({
    mutationFn: (proposalId: string) => proposalsApi.delete(proposalId),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-favorites'] });

      setExpandedRows((prev) => {
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });

      if (selectedProposal?.id === deletedId) {
        setDetailSheetOpen(false);
        setDetailFullscreen(false);
        setEditDialogOpen(false);
        setSelectedProposal(null);
      }

      toast({ title: 'Proposta excluída com sucesso', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir proposta', description: error.message, variant: 'destructive' });
    },
  });

  const revisionProposalMutation = useMutation({
    mutationFn: (proposalId: string) => proposalsApi.createRevision(proposalId),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: `Nova revisão criada (${created.code} — revisão ${created.revision})`, variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar revisão', description: error.message, variant: 'destructive' });
    },
  });

  const editDisabledReason = useMemo(() => {
    if (!editDialogOpen) return null;
    if (updateMutation.isPending) return null;
    if (isEditValid) return null;

    const fieldLabels: Partial<Record<EditFormField, string>> = {
      type: 'Tipo do contrato',
      umbrellaRef: 'Proposta original (guarda-chuva)',
      clientId: 'Cliente',
      coordinatorName: 'Responsável pela proposta',
      title: 'Título',
      riskAssessment: 'Avaliação de risco',
    };

    const parts = Object.keys(editValidationErrors)
      .map((k) => k as EditFormField)
      .filter((k) => Boolean(fieldLabels[k]))
      .map((k) => {
        const label = fieldLabels[k] || k;
        const msg = editValidationErrors[k];
        return msg && msg !== 'Campo obrigatório' ? `${label} — ${msg}` : label;
      });

    if (parts.length === 0) return 'Preencha os campos obrigatórios destacados em vermelho.';
    return `Campos pendentes:\n${parts.map((p) => `• ${p}`).join('\n')}`;
  }, [editDialogOpen, updateMutation.isPending, isEditValid, editValidationErrors]);

  const handleRowClick = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setDetailSheetOpen(true);
  };

  const handleEditProposal = (proposal: Proposal, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (!isLatestRevision(proposal)) {
      toast({
        title: 'Somente a última revisão pode ser editada',
        description: `Crie uma nova revisão para alterar a proposta ${proposal.code}.`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedProposal(proposal);
    const nextEditFormData = {
      type: proposal.type || 'fixed_price',
      umbrellaRef: proposal.umbrellaRef || '',
      clientId: proposal.clientId || '',
      coordinatorName: proposal.coordinatorName || '',
      title: proposal.title || '',
      createdAt: proposal.createdAt ? new Date(proposal.createdAt).toISOString().split('T')[0] : '',
      sentDate: proposal.sentDate ? new Date(proposal.sentDate).toISOString().split('T')[0] : '',
      dueDate: proposal.dueDate ? new Date(proposal.dueDate).toISOString().split('T')[0] : '',
      status: proposal.status || 'em_elaboracao',
      expectation: proposal.expectation || '',
      mainType: proposal.mainType || '',
      termMonths: proposal.termMonths !== undefined && proposal.termMonths !== null ? String(proposal.termMonths) : '',
      riskAssessment: proposal.riskAssessment || 'Não',
      hourJustification: proposal.hourJustification !== undefined && proposal.hourJustification !== null ? String(proposal.hourJustification) : '',
      subcontracted: proposal.subcontracted !== undefined && proposal.subcontracted !== null ? String(proposal.subcontracted) : '',
      discount: proposal.discount || '',
      coordinatorId: proposal.coordinatorId || '',
      description: proposal.description || '',
      proposalOrigin: proposal.proposalOrigin || '',
    };
    editInitialRef.current = nextEditFormData;
    setEditFormData(nextEditFormData);
    setEditTouched({});
    setEditAttemptedSubmit(false);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;
    setEditAttemptedSubmit(true);

    const toPrismaDateTime = (dateOnly: string): string | undefined => {
      if (!dateOnly) return undefined;
      // Prisma DateTime expects ISO-8601 date-time, not just YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return undefined;
      return `${dateOnly}T00:00:00.000Z`;
    };

    const isServiceOrder = editFormData.type === 'service_order';

    const errors = validateEditForm(editFormData);
    if (Object.keys(errors).length > 0) {
      return;
    }

    updateMutation.mutate({
      id: selectedProposal.id,
      data: {
        type: editFormData.type,
        umbrellaRef: isServiceOrder ? (editFormData.umbrellaRef || null) : null,
        clientId: editFormData.clientId,
        coordinatorName: editFormData.coordinatorName,
        title: editFormData.title,
        createdAt: toPrismaDateTime(editFormData.createdAt),
        sentDate: toPrismaDateTime(editFormData.sentDate),
        dueDate: toPrismaDateTime(editFormData.dueDate),
        status: editFormData.status,
        expectation: editFormData.expectation || null,
        mainType: editFormData.mainType || null,
        termMonths: editFormData.termMonths ? parseInt(editFormData.termMonths) : null,
        riskAssessment: editFormData.riskAssessment || null,
        hourJustification: editFormData.hourJustification ? parseFloat(editFormData.hourJustification) : null,
        subcontracted: editFormData.subcontracted ? parseFloat(editFormData.subcontracted) : null,
        discount: editFormData.discount || null,
        coordinatorId: editFormData.coordinatorId || null,
        description: editFormData.description || null,
        proposalOrigin: editFormData.proposalOrigin || null,
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

  const getProposalTotalValue = useCallback((proposal: Proposal): number => {
    const categoryBaseRaw = (proposal as any).categoryValuesTotal;
    const categoryBase = typeof categoryBaseRaw === 'number' ? categoryBaseRaw : Number(categoryBaseRaw);
    const baseValue = Number.isFinite(categoryBase) && categoryBase > 0
      ? categoryBase
      : Number(proposal.totalValue || 0);

    const expense = Number((proposal as any).expense || 0);
    const additiveValue = Number((proposal as any).additiveValue || 0);
    const subcontracted = Number((proposal as any).subcontracted || 0);
    const resource = Number((proposal as any).resource || 0);
    const paymentBook = Number((proposal as any).paymentBook || 0);

    const sum = baseValue + expense + additiveValue + subcontracted + resource + paymentBook;
    return Number.isFinite(sum) ? sum : 0;
  }, []);

  const formatDate = (dateStr?: string | null) => {
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
        const value = getProposalTotalValue(p);
        if (valueMin && value < parseFloat(valueMin)) return false;
        if (valueMax && value > parseFloat(valueMax)) return false;
        return true;
      })();

      // Coordinator filter
      const coordMatch = !coordinatorFilter || p.coordinatorName === coordinatorFilter;

      // Client filter
      const clientMatch = !clientFilter || p.clientId === clientFilter;

      // Conversion filter
      const conversionMatch = (() => {
        if (conversionFilter === 'all') return true;
        if (conversionFilter === 'converted') return Boolean(p.projectId);
        return !p.projectId;
      })();

      // Favorites filter
      const favoriteMatch = !showOnlyFavorites || favoritesSet.has(p.id);

      return searchMatch && statusMatch && typeMatch && dateMatch && valueMatch && coordMatch && clientMatch && conversionMatch && favoriteMatch;
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
          aValue = getProposalTotalValue(a);
          bValue = getProposalTotalValue(b);
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

      if (sortColumn === 'code') {
        const codeCompare = (aValue as string).localeCompare(bValue as string, 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        });

        if (codeCompare !== 0) {
          return sortDirection === 'asc' ? codeCompare : -codeCompare;
        }

        const aRevision = Number(a.revision || 0);
        const bRevision = Number(b.revision || 0);
        if (aRevision === bRevision) return 0;
        return sortDirection === 'asc' ? aRevision - bRevision : bRevision - aRevision;
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
  }, [proposals, search, statusFilters, typeFilters, dateFrom, dateTo, valueMin, valueMax, coordinatorFilter, clientFilter, conversionFilter, showOnlyFavorites, favoritesSet, sortColumn, sortDirection]);

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
          <span className="block leading-tight">
            {proposal.client?.razaoSocial || '-'}
          </span>
        );
      case 'title':
        return (
          <span className="block leading-tight">
            {proposal.title}
          </span>
        );
      case 'status':
        return (
          <Badge
            className={`w-full h-6 px-2 py-0 inline-flex items-center justify-center text-xs text-white text-center ${
              statusColors[proposal.status] || 'bg-gray-400'
            }`}
          >
            <span className="truncate max-w-full">
              {statusLabels[proposal.status] || proposal.status}
            </span>
          </Badge>
        );
      case 'type':
        return (
          <span className="block text-xs leading-tight whitespace-normal break-words">
            {typeLabels[proposal.type] || proposal.type}
          </span>
        );
      case 'totalValue':
        return <span className="font-medium">{formatCurrency(getProposalTotalValue(proposal))}</span>;
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
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-primary hover-elevate underline-offset-4 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setExpensesProposal(proposal);
              setExpensesDialogOpen(true);
            }}
            data-testid={`button-expenses-${proposal.id}`}
            title="Clique para ver/editar despesas"
          >
            {formatCurrency((proposal as any).expense ?? 0)}
          </Button>
        );
      case 'anfibex':
        return (proposal as any).anfibex || '-';
      case 'discount':
        return (proposal as any).discount || '-';
      case 'proposalOrigin':
        return (proposal as any).proposalOrigin || '-';
      case 'quantity':
        return proposal.quantity || '-';
      case 'description':
        return proposal.description || '-';
      case 'additiveValue':
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-primary hover-elevate underline-offset-4 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setAdditivesProposal(proposal);
              setAdditivesDialogOpen(true);
            }}
            data-testid={`button-additives-${proposal.id}`}
            title="Clique para ver/editar aditivos"
          >
            {formatCurrency((proposal as any).additiveValue ?? 0)}
          </Button>
        );
      case 'categoryValues':
        const categoryTotal = (proposal as any).categoryValuesTotal || 0;
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-primary hover-elevate underline-offset-4 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProposal(proposal);
              setCategoryDrawerOpen(true);
            }}
            data-testid={`button-category-values-${proposal.id}`}
            title="Clique para ver valores por categoria"
          >
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
                        <SelectItem value="fixed_price">Preço fechado</SelectItem>
                        <SelectItem value="appropriation">Preço sob demanda</SelectItem>
                        <SelectItem value="umbrella">Guarda-chuva</SelectItem>
                        <SelectItem value="service_order">Ordem de serviço (consequente do contrato Guarda-chuva)</SelectItem>
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
                  <Button type="button" variant="outline" onClick={closeDialog} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50">
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
                      {proposalStatusOptions.map(({ value: key, label }) => (
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
                      <Label className="font-medium">Tipo do contrato</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {proposalTypeOptions.map(({ value: key, label }) => (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                        <Label className="font-medium">Valor Total (R$)</Label>
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

                    {/* Conversion */}
                    <div className="space-y-2">
                      <Label className="font-medium">Conversão</Label>
                      <Select
                        value={conversionFilter}
                        onValueChange={(v) => {
                          setConversionFilter(v as 'all' | 'converted' | 'not_converted');
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-conversion">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="converted">Somente convertidas</SelectItem>
                          <SelectItem value="not_converted">Somente não convertidas</SelectItem>
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
          <Card className="mt-4">
            <CardContent className="py-16 text-center text-muted-foreground">
              {showOnlyFavorites ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <Star className="h-8 w-8 text-yellow-400" />
                  </div>
                  <p className="text-lg font-medium">Você ainda não tem propostas favoritas</p>
                  <p className="text-sm">Clique na estrela ao lado de uma proposta para adicioná-la aos favoritos</p>
                  <Button 
                    variant="default" 
                    onClick={() => setShowOnlyFavorites(false)}
                    className="mt-2"
                    data-testid="button-show-all-proposals"
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Ver todas as propostas
                  </Button>
                </div>
              ) : (
                <>
                  <p>Nenhuma proposta encontrada</p>
                  {(search || activeFilterCount > 0) && (
                    <Button variant="ghost" onClick={clearAllFilters} className="mt-2">
                      Limpar filtros
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-1 min-h-0 mt-4" ref={tableContainerRef}>
            <div className="sm:hidden px-4 pt-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowFullColumnsMobile((prev) => !prev)}
              >
                {showFullColumnsMobile ? 'Visão compacta' : 'Ver completo'}
              </Button>
            </div>
            <div className="sticky top-16 z-20 bg-muted border-b border-border">
              <Table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: 40 }} />
                  {hasOverflowColumns && <col style={{ width: 48 }} />}
                  {primaryColumns.map((col) => (
                    <col key={col.id} style={{ width: estimateColumnWidthPx(col.width) }} />
                  ))}
                  <col style={{ width: 96 }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-10 px-2">
                      <Button
                        size="icon"
                        variant={showOnlyFavorites ? 'default' : 'ghost'}
                        className="h-7 w-7"
                        onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                        data-testid="button-filter-favorites"
                        title={showOnlyFavorites ? 'Mostrando apenas favoritos' : 'Mostrar apenas favoritos'}
                      >
                        <Star className={`h-4 w-4 ${showOnlyFavorites ? 'fill-current' : ''}`} />
                      </Button>
                    </TableHead>
                    {hasOverflowColumns && (
                      <TableHead className="w-12 px-2">
                        <span className="sr-only">Expandir</span>
                      </TableHead>
                    )}
                    {primaryColumns.map((col) => (
                      <TableHead
                        key={col.id}
                        style={{ width: estimateColumnWidthPx(col.width) }}
                        className={`text-xs font-medium cursor-pointer select-none overflow-hidden ${col.width || 'w-24'} min-w-[60px]`}
                        data-testid={`header-sort-${col.id}`}
                        onClick={() => handleSort(col.id)}
                      >
                        <div className="flex items-center gap-1">
                          <span className="break-words leading-tight">{col.label}</span>
                          {getSortIcon(col.id)}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
            </div>

            <div ref={tableViewportRef} className="overflow-x-hidden">
              <Table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: 40 }} />
                  {hasOverflowColumns && <col style={{ width: 48 }} />}
                  {primaryColumns.map((col) => (
                    <col key={col.id} style={{ width: estimateColumnWidthPx(col.width) }} />
                  ))}
                  <col style={{ width: 96 }} />
                </colgroup>
                <TableBody>
                  {paginatedProposals.map((proposal) => {
                    const isExpanded = showFullColumnsMobile || expandedRows.has(proposal.id);
                    return (
                      <React.Fragment key={proposal.id}>
                        <TableRow
                          data-testid={`row-proposal-${proposal.id}`}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-muted/30' : 'hover:bg-muted/50'}`}
                          onClick={() => handleRowClick(proposal)}
                        >
                          <TableCell className="w-10 px-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => handleToggleFavorite(proposal.id, e)}
                              data-testid={`button-favorite-${proposal.id}`}
                              title={favoritesSet.has(proposal.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                            >
                              <Star 
                                className={`h-4 w-4 transition-colors ${
                                  favoritesSet.has(proposal.id) 
                                    ? 'fill-yellow-400 text-yellow-400' 
                                    : 'text-muted-foreground hover:text-yellow-400'
                                }`} 
                              />
                            </Button>
                          </TableCell>
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
                            <TableCell 
                              key={col.id} 
                              style={{ width: estimateColumnWidthPx(col.width) }}
                              className={`text-sm py-2 whitespace-normal break-words overflow-hidden align-top ${col.width || 'w-24'}`}
                            >
                              {getCellValue(proposal, col.id)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isLatestRevision(proposal) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  data-testid={`button-edit-proposal-${proposal.id}`}
                                  onClick={(e) => handleEditProposal(proposal, e)}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}

                              {isLatestRevision(proposal) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  data-testid={`button-revision-proposal-${proposal.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    revisionProposalMutation.mutate(proposal.id);
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  disabled={
                                    revisionProposalMutation.isPending &&
                                    revisionProposalMutation.variables === proposal.id
                                  }
                                  title="Revisão"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}

                              {isLatestRevision(proposal) && (
                                (() => {
                                  const isSuccessStatus = ['com_sucesso', 'sucesso_aditivo', 'approved', 'converted'].includes(proposal.status);
                                  const deleteDisabled = isSuccessStatus;
                                  const deleteTooltip = deleteDisabled
                                    ? 'Exclusão não permitida. Existe um ou mais valor por categoria vinculado a este item.'
                                    : null;

                                  if (deleteDisabled) {
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7"
                                              data-testid={`button-delete-proposal-${proposal.id}`}
                                              disabled
                                              onClick={(e) => e.stopPropagation()}
                                              onMouseDown={(e) => e.stopPropagation()}
                                              onPointerDown={(e) => e.stopPropagation()}
                                              title="Excluir"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          {deleteTooltip}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  }

                                  return (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7"
                                          data-testid={`button-delete-proposal-${proposal.id}`}
                                          onClick={(e) => e.stopPropagation()}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onPointerDown={(e) => e.stopPropagation()}
                                          title="Excluir"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Esta ação não pode ser desfeita. A proposta “{proposal.code}” será removida.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                            }}
                                            onPointerDown={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                            }}
                                          >
                                            Cancelar
                                          </AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteProposalMutation.mutate(proposal.id);
                                            }}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                            }}
                                            onPointerDown={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                            }}
                                          >
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  );
                                })()
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {hasOverflowColumns && isExpanded && (
                          <TableRow
                            key={`${proposal.id}-expanded`}
                            className="bg-muted/20 border-b-2 border-primary/10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TableCell
                              colSpan={primaryColumns.length + 3}
                              className="p-0"
                            >
                              <div className="px-6 py-3 animate-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                  {overflowColumns.map((col) => (
                                    <div
                                      key={col.id}
                                      className="flex flex-col gap-1 p-3 rounded-lg bg-background/50 border border-border/50 overflow-hidden"
                                    >
                                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider break-words leading-tight">
                                        {col.label}
                                      </span>
                                      <span className="text-sm font-medium whitespace-normal break-words">
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
        <Sheet open={detailSheetOpen && !detailFullscreen} onOpenChange={setDetailSheetOpen}>
          <SheetContent 
            className="w-full sm:max-w-xl overflow-y-auto"
            actionButton={
              <button
                onClick={() => setDetailFullscreen(true)}
                title="Expandir para tela cheia"
                className="h-6 w-6 flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                data-testid="button-expand-detail"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            }
          >
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
                  {isLatestRevision(selectedProposal) && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleEditProposal(selectedProposal)}
                      data-testid="button-edit-from-sheet"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  )}
                  {['com_sucesso', 'sucesso_aditivo', 'approved'].includes(selectedProposal.status) && (
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

                {/* Accordion Sections (layout anterior) */}
                <Accordion type="multiple" defaultValue={['basic', 'dates', 'values', 'people']} className="w-full">
                  <AccordionItem value="basic">
                    <AccordionTrigger className="text-sm font-medium">Informações Básicas</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Código da proposta</Label>
                          <p className="font-mono">{selectedProposal.code}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Revisão</Label>
                          <p>{selectedProposal.revision || 0}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo do contrato</Label>
                          <p>{typeLabels[selectedProposal.type] || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Cliente</Label>
                          <p className="font-medium">{selectedProposal.client?.razaoSocial || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Responsável pela proposta</Label>
                          <p>{selectedProposal.coordinatorName || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Coordenador do projeto</Label>
                          <p>{userNameById.get(selectedProposal.coordinatorId || '') || '-'}</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Título</Label>
                          <p className="text-sm">{selectedProposal.title || '-'}</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Observação</Label>
                          <p className="text-sm whitespace-pre-wrap">{selectedProposal.description || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="classification">
                    <AccordionTrigger className="text-sm font-medium">Classificação</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Cód. proposta antigo</Label>
                          <p>{(selectedProposal as any).proposalOrigin || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Proposta original (guarda-chuva)</Label>
                          <p>{selectedProposal.umbrellaRef || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo principal</Label>
                          <p>{selectedProposal.mainType || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Expectativa</Label>
                          <p>{(selectedProposal as any).expectation || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Prazo (em meses)</Label>
                          <p>{(selectedProposal as any).termMonths || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Aval. do risco</Label>
                          <p>{(selectedProposal as any).riskAssessment || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">% contratação</Label>
                          <p>{(selectedProposal as any).acquisitionMargin || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Código do contrato</Label>
                          <p>{(selectedProposal as any).contractCode || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">OAs</Label>
                          <p>{selectedProposal.workOrders || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="dates">
                    <AccordionTrigger className="text-sm font-medium">Datas</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Data de solicitação</Label>
                          <p>{formatDate(selectedProposal.createdAt)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data de emissão</Label>
                          <p>{formatDate(selectedProposal.sentDate)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data de validade</Label>
                          <p>{formatDate((selectedProposal as any).dueDate)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data de atualização</Label>
                          <p>{formatDate(selectedProposal.updatedAt)}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="values">
                    <AccordionTrigger className="text-sm font-medium">Valores</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="col-span-2 bg-primary/10 rounded-lg p-3">
                          <Label className="text-xs text-muted-foreground">Valor total da proposta</Label>
                          <p className="text-xl font-bold text-primary">{formatCurrency(getProposalTotalValue(selectedProposal))}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Qtd proposta</Label>
                          <p>{selectedProposal.quantity || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Vl. sub proposta</Label>
                          <p>{formatCurrency((selectedProposal as any).subcontracted)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Aditivos</Label>
                          <p>{formatCurrency((selectedProposal as any).additiveValue)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Despesas</Label>
                          <p>{formatCurrency((selectedProposal as any).expense)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Valor do desconto</Label>
                          <p>{(selectedProposal as any).discount || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Valores por categoria</Label>
                          <p>{formatCurrency((selectedProposal as any).categoryValuesTotal || 0)}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="people">
                    <AccordionTrigger className="text-sm font-medium">Responsáveis</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Responsável pela proposta</Label>
                          <p>{selectedProposal.coordinatorName || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Coordenador do projeto</Label>
                          <p>{userNameById.get(selectedProposal.coordinatorId || '') || '-'}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Detail Dialog (Fullscreen) */}
        <Dialog 
          open={detailSheetOpen && detailFullscreen} 
          onOpenChange={(open) => {
            if (!open) {
              setDetailSheetOpen(false);
              setDetailFullscreen(false);
            }
          }}
        >
          <DialogContent 
            className="max-w-[95vw] h-[90vh] flex flex-col overflow-hidden"
            actionButton={
              <button
                onClick={() => setDetailFullscreen(false)}
                title="Voltar para painel lateral"
                className="h-6 w-6 flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                data-testid="button-minimize-detail"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            }
          >
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <span className="text-primary font-mono">{selectedProposal?.code}</span>
                {selectedProposal && (
                  <Badge className={`text-white ${statusColors[selectedProposal.status]}`}>
                    {statusLabels[selectedProposal.status]}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-base font-medium text-foreground">
                {selectedProposal?.title}
              </DialogDescription>
            </DialogHeader>

            {selectedProposal && (
              <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                {/* Quick Actions */}
                <div className="flex gap-2">
                  {isLatestRevision(selectedProposal) && (
                    <Button
                      variant="outline"
                      onClick={() => handleEditProposal(selectedProposal)}
                      data-testid="button-edit-from-fullscreen"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  )}
                  {['com_sucesso', 'sucesso_aditivo', 'approved'].includes(selectedProposal.status) && (
                    <Button
                      onClick={() => convertMutation.mutate(selectedProposal.id)}
                      disabled={convertMutation.isPending}
                      data-testid="button-convert-from-fullscreen"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Converter em Projeto
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Two-column layout for fullscreen (layout anterior) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Card>
                      <CardContent className="pt-4">
                        <h3 className="font-semibold mb-4">Informações Básicas</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Código da proposta</Label>
                            <p className="font-mono">{selectedProposal.code}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Revisão</Label>
                            <p>{selectedProposal.revision || 0}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Tipo do contrato</Label>
                            <p>{typeLabels[selectedProposal.type] || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Cliente</Label>
                            <p className="font-medium">{selectedProposal.client?.razaoSocial || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Responsável pela proposta</Label>
                            <p>{selectedProposal.coordinatorName || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Coordenador do projeto</Label>
                            <p>{userNameById.get(selectedProposal.coordinatorId || '') || '-'}</p>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Título</Label>
                            <p className="text-sm">{selectedProposal.title || '-'}</p>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Observação</Label>
                            <p className="text-sm whitespace-pre-wrap">{selectedProposal.description || '-'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-4">
                        <h3 className="font-semibold mb-4">Classificação</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Cód. proposta antigo</Label>
                            <p>{(selectedProposal as any).proposalOrigin || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Proposta original (guarda-chuva)</Label>
                            <p>{selectedProposal.umbrellaRef || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Tipo principal</Label>
                            <p>{selectedProposal.mainType || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Expectativa</Label>
                            <p>{(selectedProposal as any).expectation || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Prazo (em meses)</Label>
                            <p>{(selectedProposal as any).termMonths || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Aval. do risco</Label>
                            <p>{(selectedProposal as any).riskAssessment || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">% contratação</Label>
                            <p>{(selectedProposal as any).acquisitionMargin || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Código do contrato</Label>
                            <p>{(selectedProposal as any).contractCode || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">OAs</Label>
                            <p>{selectedProposal.workOrders || '-'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <Card>
                      <CardContent className="pt-4">
                        <h3 className="font-semibold mb-4">Datas</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Data de solicitação</Label>
                            <p>{formatDate(selectedProposal.createdAt)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Data de emissão</Label>
                            <p>{formatDate(selectedProposal.sentDate)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Data de validade</Label>
                            <p>{formatDate((selectedProposal as any).dueDate)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Data de atualização</Label>
                            <p>{formatDate(selectedProposal.updatedAt)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-4">
                        <h3 className="font-semibold mb-4">Valores</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2 bg-primary/10 rounded-lg p-3">
                            <Label className="text-xs text-muted-foreground">Valor total da proposta</Label>
                            <p className="text-xl font-bold text-primary">{formatCurrency(getProposalTotalValue(selectedProposal))}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Qtd proposta</Label>
                            <p>{selectedProposal.quantity || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Vl. sub proposta</Label>
                            <p>{formatCurrency((selectedProposal as any).subcontracted)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Aditivos</Label>
                            <p>{formatCurrency((selectedProposal as any).additiveValue)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Despesas</Label>
                            <p>{formatCurrency((selectedProposal as any).expense)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Valor do desconto</Label>
                            <p>{(selectedProposal as any).discount || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Valores por categoria</Label>
                            <p>{formatCurrency((selectedProposal as any).categoryValuesTotal || 0)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Expenses Dialog */}
        <Dialog
          open={expensesDialogOpen}
          onOpenChange={(open) => {
            setExpensesDialogOpen(open);
            if (!open) {
              setExpensesProposal(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Despesas — {expensesProposal?.code}
              </DialogTitle>
              <DialogDescription>
                {expensesProposal?.title}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Total: <span className="font-medium text-foreground">{formatCurrency(expensesData?.total ?? (expensesProposal as any)?.expense ?? 0)}</span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!expensesProposalId) return;

                const description = expenseForm.description.trim();
                const value = parseMoneyMaskToNumber(expenseForm.value.trim());

                if (!description) {
                  toast({
                    title: 'Descrição obrigatória',
                    description: 'Informe a descrição da despesa.',
                    variant: 'destructive',
                  });
                  return;
                }

                if (value === null) {
                  toast({
                    title: 'Valor inválido',
                    description: 'Informe um valor numérico válido.',
                    variant: 'destructive',
                  });
                  return;
                }

                if (editingExpenseId) {
                  updateExpenseMutation.mutate({
                    proposalId: expensesProposalId,
                    expenseId: editingExpenseId,
                    description,
                    value,
                    reimbursable: expenseForm.reimbursable,
                  });
                } else {
                  createExpenseMutation.mutate({
                    proposalId: expensesProposalId,
                    description,
                    value,
                    reimbursable: expenseForm.reimbursable,
                  });
                }
              }}
              className="space-y-3"
            >
              <p className="text-xs text-muted-foreground">Campos com * são obrigatórios.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-2">
                  <Label>Descrição *</Label>
                  <Input
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Ex.: Deslocamento, alimentação, hospedagem..."
                    data-testid="input-expense-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                      R$
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={expenseForm.value}
                      onChange={(e) =>
                        setExpenseForm((prev) => ({
                          ...prev,
                          value: formatMoneyMask(e.target.value),
                        }))
                      }
                      placeholder="0,00"
                      className="pl-10"
                      data-testid="input-expense-value"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={expenseForm.reimbursable}
                      onCheckedChange={(v) => setExpenseForm((prev) => ({ ...prev, reimbursable: Boolean(v) }))}
                      id="expense-reimbursable"
                    />
                    <Label htmlFor="expense-reimbursable">Reembolsável *</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">Marque para Sim; desmarque para Não.</p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {editingExpenseId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setExpenseForm({ description: '', value: '', reimbursable: false });
                        setEditingExpenseId(null);
                        setEditingExpenseInitial(null);
                      }}
                      data-testid="button-expense-cancel-edit"
                    >
                      Cancelar
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          type="submit"
                          disabled={Boolean(expenseSubmitDisabledReason)}
                          data-testid="button-expense-submit"
                        >
                          {editingExpenseId ? 'Salvar' : 'Adicionar'}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {expenseSubmitDisabledReason && (
                      <TooltipContent
                        side="top"
                        align="end"
                        collisionPadding={12}
                        className="max-w-[240px] whitespace-normal break-words"
                      >
                        {expenseSubmitDisabledReason}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </div>
              </div>
            </form>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Itens ({expensesItems.length})</div>
                <div className="text-sm text-muted-foreground">
                  Total:{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(expensesData?.total ?? 0)}
                  </span>
                </div>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-32">Valor</TableHead>
                      <TableHead className="w-32">Reembolsável</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensesLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Carregando despesas...
                        </TableCell>
                      </TableRow>
                    ) : expensesItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhuma despesa cadastrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleExpensesItems.map((item: ProposalExpenseItem) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.description}</TableCell>
                          <TableCell className="text-sm font-medium">{formatCurrency(item.value)}</TableCell>
                          <TableCell className="text-sm">{item.reimbursable ? 'Sim' : 'Não'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingExpenseId(item.id);
                                  setEditingExpenseInitial({
                                    description: item.description?.trim() || '',
                                    value: typeof item.value === 'number' ? item.value : Number(item.value),
                                    reimbursable: Boolean(item.reimbursable),
                                  });
                                  setExpenseForm({
                                    description: item.description,
                                    value: formatMoneyFromValue(item.value),
                                    reimbursable: Boolean(item.reimbursable),
                                  });
                                }}
                                data-testid={`button-expense-edit-${item.id}`}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-expense-delete-${item.id}`}
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. A despesa “{item.description}” será removida.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => {
                                        if (!expensesProposalId) return;
                                        deleteExpenseMutation.mutate({ proposalId: expensesProposalId, expenseId: item.id });
                                      }}
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {expensesItems.length > 0 ? (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground">Itens por página</div>
                    <Select
                      value={String(safeExpensesItemsPerPage)}
                      onValueChange={(value) => {
                        const next = Number(value);
                        setExpensesItemsPerPage([5, 10, 15].includes(next) ? next : 5);
                        setExpensesItemsPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    {expensesItemsTotalPages > 1 ? (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Página {expensesItemsPage} de {expensesItemsTotalPages}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => setExpensesItemsPage((p) => Math.max(1, p - 1))}
                          disabled={expensesItemsPage === 1}
                        >
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => setExpensesItemsPage((p) => Math.min(expensesItemsTotalPages, p + 1))}
                          disabled={expensesItemsPage === expensesItemsTotalPages}
                        >
                          Próxima
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        {/* Additives Dialog */}
        <Dialog
          open={additivesDialogOpen}
          onOpenChange={(open) => {
            setAdditivesDialogOpen(open);
            if (!open) {
              setAdditivesProposal(null);
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Aditivos — {additivesProposal?.code} (revisão: {typeof additivesProposal?.revision === 'number' ? additivesProposal.revision : '-'})
              </DialogTitle>
              <DialogDescription>{additivesProposal?.title}</DialogDescription>
            </DialogHeader>

            {additivesProposal?.proposalOrigin || additivesProposal?.umbrellaRef ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {additivesProposal?.proposalOrigin ? (
                  <div className="text-muted-foreground">
                    Cód. proposta antigo:{' '}
                    <span className="text-foreground font-medium">{additivesProposal.proposalOrigin}</span>
                  </div>
                ) : null}
                {additivesProposal?.umbrellaRef ? (
                  <div className="text-muted-foreground">
                    Proposta original (guarda-chuva):{' '}
                    <span className="text-foreground font-medium">{additivesProposal.umbrellaRef}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Total:{' '}
                <span className="font-medium text-foreground">
                  {formatCurrency(additivesData?.total ?? (additivesProposal as any)?.additiveValue ?? 0)}
                </span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!additivesProposalId) return;

                const termMonthsRaw = additiveForm.termMonths.trim();
                const termMonths = parseTermMonthsInput(termMonthsRaw);
                if (termMonthsRaw && termMonths === null) {
                  toast({
                    title: 'Prazo inválido',
                    description: 'Informe um número inteiro (em meses).',
                    variant: 'destructive',
                  });
                  return;
                }

                const parseMoneyField = (raw: string, label: string): number | null => {
                  const trimmed = raw.trim();
                  if (!trimmed) return 0;
                  const parsed = parseMoneyMaskToNumber(trimmed);
                  if (parsed === null) {
                    toast({
                      title: 'Valor inválido',
                      description: `Informe um valor numérico válido para ${label}.`,
                      variant: 'destructive',
                    });
                    return null;
                  }
                  return parsed;
                };

                const subcontractValue = parseMoneyField(additiveForm.subcontractValue, 'subcontratação');
                if (subcontractValue === null) return;
                const mobilizationValue = parseMoneyField(additiveForm.mobilizationValue, 'mobilização');
                if (mobilizationValue === null) return;
                const readjustValue = parseMoneyField(additiveForm.readjustValue, 'reajuste');
                if (readjustValue === null) return;

                if (editingAdditiveId) {
                  updateAdditiveMutation.mutate({
                    proposalId: additivesProposalId,
                    additiveId: editingAdditiveId,
                    termMonths,
                    subcontractValue,
                    mobilizationValue,
                    readjustValue,
                  });
                } else {
                  createAdditiveMutation.mutate({
                    proposalId: additivesProposalId,
                    termMonths,
                    subcontractValue,
                    mobilizationValue,
                    readjustValue,
                  });
                }
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Prazo (meses)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={additiveForm.termMonths}
                    onChange={(e) => setAdditiveForm((prev) => ({ ...prev, termMonths: e.target.value }))}
                    placeholder="0"
                    min={0}
                    data-testid="input-additive-term-months"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Vr. subcontratação</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                      R$
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={additiveForm.subcontractValue}
                      onChange={(e) =>
                        setAdditiveForm((prev) => ({
                          ...prev,
                          subcontractValue: formatMoneyMask(e.target.value),
                        }))
                      }
                      placeholder="0,00"
                      className="pl-10"
                      data-testid="input-additive-subcontract"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vr. mobilização</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                      R$
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={additiveForm.mobilizationValue}
                      onChange={(e) =>
                        setAdditiveForm((prev) => ({
                          ...prev,
                          mobilizationValue: formatMoneyMask(e.target.value),
                        }))
                      }
                      placeholder="0,00"
                      className="pl-10"
                      data-testid="input-additive-mobilization"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vr. reajuste</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                      R$
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={additiveForm.readjustValue}
                      onChange={(e) =>
                        setAdditiveForm((prev) => ({
                          ...prev,
                          readjustValue: formatMoneyMask(e.target.value),
                        }))
                      }
                      placeholder="0,00"
                      className="pl-10"
                      data-testid="input-additive-readjust"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                {editingAdditiveId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAdditiveForm({ termMonths: '', subcontractValue: '', mobilizationValue: '', readjustValue: '' });
                      setEditingAdditiveId(null);
                      setEditingAdditiveInitial(null);
                    }}
                    data-testid="button-additive-cancel-edit"
                  >
                    Cancelar
                  </Button>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="submit"
                        disabled={Boolean(additiveSubmitDisabledReason)}
                        data-testid="button-additive-submit"
                      >
                        {editingAdditiveId ? 'Salvar' : 'Adicionar'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {additiveSubmitDisabledReason && (
                    <TooltipContent
                      side="top"
                      align="end"
                      collisionPadding={12}
                      className="max-w-[240px] whitespace-normal break-words"
                    >
                      {additiveSubmitDisabledReason}
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            </form>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Itens ({additivesItems.length})</div>
                <div className="text-sm text-muted-foreground">
                  Total:{' '}
                  <span className="font-medium text-foreground">{formatCurrency(additivesData?.total ?? 0)}</span>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Prazo</TableHead>
                      <TableHead className="w-32">Subcontratação</TableHead>
                      <TableHead className="w-32">Mobilização</TableHead>
                      <TableHead className="w-28">Reajuste</TableHead>
                      <TableHead className="w-28 text-center leading-tight">Valores por categoria</TableHead>
                      <TableHead className="w-20 text-center leading-tight">Despesas</TableHead>
                      <TableHead className="w-20 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {additivesLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                          Carregando aditivos...
                        </TableCell>
                      </TableRow>
                    ) : additivesItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhum aditivo cadastrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleAdditivesItems.map((item: ProposalAdditiveItem) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.termMonths ?? '-'}</TableCell>
                          <TableCell className="text-sm font-medium">{formatCurrency(item.subcontractValue)}</TableCell>
                          <TableCell className="text-sm font-medium">{formatCurrency(item.mobilizationValue)}</TableCell>
                          <TableCell className="text-sm font-medium">{formatCurrency(item.readjustValue)}</TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 mx-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!additivesProposal) return;
                                setSelectedProposal(additivesProposal);
                                setCategoryDrawerOpen(true);
                              }}
                              title="Abrir valores por categoria"
                              data-testid={`button-additive-row-category-values-${item.id}`}
                            >
                              <Search className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 mx-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!additivesProposal) return;
                                setExpensesProposal(additivesProposal);
                                setExpensesDialogOpen(true);
                              }}
                              title="Abrir despesas"
                              data-testid={`button-additive-row-expenses-${item.id}`}
                            >
                              <Search className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingAdditiveId(item.id);
                                  setEditingAdditiveInitial({
                                    termMonths: item.termMonths ?? null,
                                    subcontractValue: typeof item.subcontractValue === 'number' ? item.subcontractValue : Number(item.subcontractValue),
                                    mobilizationValue: typeof item.mobilizationValue === 'number' ? item.mobilizationValue : Number(item.mobilizationValue),
                                    readjustValue: typeof item.readjustValue === 'number' ? item.readjustValue : Number(item.readjustValue),
                                  });
                                  setAdditiveForm({
                                    termMonths: item.termMonths === null || typeof item.termMonths === 'undefined' ? '' : String(item.termMonths),
                                    subcontractValue: formatMoneyFromValue(item.subcontractValue),
                                    mobilizationValue: formatMoneyFromValue(item.mobilizationValue),
                                    readjustValue: formatMoneyFromValue(item.readjustValue),
                                  });
                                }}
                                data-testid={`button-additive-edit-${item.id}`}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-additive-delete-${item.id}`}
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir aditivo?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. O aditivo será removido.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => {
                                        if (!additivesProposalId) return;
                                        deleteAdditiveMutation.mutate({ proposalId: additivesProposalId, additiveId: item.id });
                                      }}
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {additivesItems.length > 0 ? (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground">Itens por página</div>
                    <Select
                      value={String(safeAdditivesItemsPerPage)}
                      onValueChange={(value) => {
                        const next = Number(value);
                        setAdditivesItemsPerPage([5, 10, 15].includes(next) ? next : 5);
                        setAdditivesItemsPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    {additivesItemsTotalPages > 1 ? (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Página {additivesItemsPage} de {additivesItemsTotalPages}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => setAdditivesItemsPage((p) => Math.max(1, p - 1))}
                          disabled={additivesItemsPage === 1}
                        >
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => setAdditivesItemsPage((p) => Math.min(additivesItemsTotalPages, p + 1))}
                          disabled={additivesItemsPage === additivesItemsTotalPages}
                        >
                          Próxima
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setEditAttemptedSubmit(false);
              setEditTouched({});
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Proposta - {selectedProposal?.code}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código da proposta</Label>
                  <Input value={selectedProposal?.code || ''} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo do contrato *</Label>
                  <Select
                    value={editFormData.type}
                    onValueChange={(value) => {
                      setEditTouched((prev) => ({ ...prev, type: true }));
                      setEditFormData({
                        ...editFormData,
                        type: value,
                        umbrellaRef: value === 'service_order' ? editFormData.umbrellaRef : '',
                      });
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-edit-proposal-type"
                      className={shouldShowEditError('type') ? 'border-destructive' : ''}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_price">Preço fechado</SelectItem>
                      <SelectItem value="appropriation">Preço sob demanda</SelectItem>
                      <SelectItem value="umbrella">Guarda-chuva</SelectItem>
                      <SelectItem value="service_order">Ordem de serviço (consequente do contrato Guarda-chuva)</SelectItem>
                    </SelectContent>
                  </Select>
                  {shouldShowEditError('type') && (
                    <p className="text-xs text-destructive">{editValidationErrors.type}</p>
                  )}
                </div>
              </div>

              {editFormData.type === 'service_order' && (
                <div className="space-y-2">
                  <Label>Proposta original (guarda-chuva) *</Label>
                  <Select
                    value={editFormData.umbrellaRef || undefined}
                    onValueChange={(value) => {
                      setEditTouched((prev) => ({ ...prev, umbrellaRef: true }));
                      setEditFormData({ ...editFormData, umbrellaRef: value });
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-edit-proposal-umbrella"
                      className={shouldShowEditError('umbrellaRef') ? 'border-destructive' : ''}
                    >
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {proposals
                        .filter((p) => p.type === 'umbrella')
                        .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.code}>
                            {p.title ? `${p.code} - ${p.title}` : p.code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {shouldShowEditError('umbrellaRef') && (
                    <p className="text-xs text-destructive">{editValidationErrors.umbrellaRef}</p>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select
                    value={editFormData.clientId}
                    onValueChange={(value) => {
                      setEditTouched((prev) => ({ ...prev, clientId: true }));
                      setEditFormData({ ...editFormData, clientId: value });
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-edit-proposal-client"
                      className={shouldShowEditError('clientId') ? 'border-destructive' : ''}
                    >
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
                  {shouldShowEditError('clientId') && (
                    <p className="text-xs text-destructive">{editValidationErrors.clientId}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Responsável pela proposta *</Label>
                  <Select
                    value={editFormData.coordinatorName || undefined}
                    onValueChange={(value) => {
                      setEditTouched((prev) => ({ ...prev, coordinatorName: true }));
                      setEditFormData({ ...editFormData, coordinatorName: value });
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-edit-proposal-responsible"
                      className={shouldShowEditError('coordinatorName') ? 'border-destructive' : ''}
                    >
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => u.isActive)
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .map((u) => (
                          <SelectItem key={u.id} value={u.name}>
                            {u.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {shouldShowEditError('coordinatorName') && (
                    <p className="text-xs text-destructive">{editValidationErrors.coordinatorName}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Título *</Label>
                  <Input
                    id="edit-title"
                    data-testid="input-edit-proposal-title"
                    value={editFormData.title}
                    onChange={(e) => {
                      setEditTouched((prev) => ({ ...prev, title: true }));
                      setEditFormData({ ...editFormData, title: e.target.value });
                    }}
                    required
                    className={shouldShowEditError('title') ? 'border-destructive' : ''}
                  />
                  {shouldShowEditError('title') && (
                    <p className="text-xs text-destructive">{editValidationErrors.title}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Data de solicitação</Label>
                  <Input 
                    type="date"
                    data-testid="input-edit-proposal-request-date"
                    value={editFormData.createdAt}
                    onChange={(e) => setEditFormData({ ...editFormData, createdAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-sentDate">Data de emissão</Label>
                  <Input
                    id="edit-sentDate"
                    type="date"
                    data-testid="input-edit-proposal-issue-date"
                    value={editFormData.sentDate}
                    onChange={(e) => setEditFormData({ ...editFormData, sentDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dueDate">Data de validade</Label>
                  <Input
                    id="edit-dueDate"
                    type="date"
                    data-testid="input-edit-proposal-due-date"
                    value={editFormData.dueDate}
                    onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de atualização</Label>
                  <Input 
                    value={selectedProposal?.updatedAt ? new Date(selectedProposal.updatedAt).toLocaleDateString('pt-BR') : ''} 
                    disabled 
                    className="bg-muted" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Situação</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {proposalStatusOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Expectativa</Label>
                  <Select
                    value={editFormData.expectation || undefined}
                    onValueChange={(value) => setEditFormData({ ...editFormData, expectation: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-expectation">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Positiva">Positiva</SelectItem>
                      <SelectItem value="Negativa">Negativa</SelectItem>
                      <SelectItem value="Não se sabe">Não se sabe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-mainType">Tipo principal</Label>
                  <Select
                    value={editFormData.mainType || undefined}
                    onValueChange={(value) => setEditFormData({ ...editFormData, mainType: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-main-type">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {mainTypeOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-termMonths">Prazo (em meses)</Label>
                  <Input
                    id="edit-termMonths"
                    type="number"
                    data-testid="input-edit-proposal-term-months"
                    value={editFormData.termMonths}
                    onChange={(e) => setEditFormData({ ...editFormData, termMonths: e.target.value })}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avaliação de risco *</Label>
                  <Select
                    value={editFormData.riskAssessment}
                    onValueChange={(value) => {
                      setEditTouched((prev) => ({ ...prev, riskAssessment: true }));
                      setEditFormData({ ...editFormData, riskAssessment: value });
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-edit-proposal-risk"
                      className={shouldShowEditError('riskAssessment') ? 'border-destructive' : ''}
                    >
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Não">Não</SelectItem>
                      <SelectItem value="Sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                  {shouldShowEditError('riskAssessment') && (
                    <p className="text-xs text-destructive">{editValidationErrors.riskAssessment}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-hourJustification">Valor da mobilização</Label>
                  <Input
                    id="edit-hourJustification"
                    type="number"
                    step="0.01"
                    data-testid="input-edit-proposal-mobilization"
                    value={editFormData.hourJustification}
                    onChange={(e) => setEditFormData({ ...editFormData, hourJustification: e.target.value })}
                    placeholder="Não usar separador de milhar (ex.: 1500.80)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-subcontracted">Valor da subcontratação</Label>
                  <Input
                    id="edit-subcontracted"
                    type="number"
                    step="0.01"
                    data-testid="input-edit-proposal-subcontracted"
                    value={editFormData.subcontracted}
                    onChange={(e) => setEditFormData({ ...editFormData, subcontracted: e.target.value })}
                    placeholder="Não usar separador de milhar (ex.: 1500.80)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-discount">Valor do desconto</Label>
                  <Input
                    id="edit-discount"
                    data-testid="input-edit-proposal-discount"
                    value={editFormData.discount}
                    onChange={(e) => setEditFormData({ ...editFormData, discount: e.target.value })}
                    placeholder="Não usar separador de milhar (ex.: 1500.80)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quem será o coordenador do projeto?</Label>
                  <Select
                    value={editFormData.coordinatorId || undefined}
                    onValueChange={(value) => setEditFormData({ ...editFormData, coordinatorId: value })}
                  >
                    <SelectTrigger data-testid="select-edit-proposal-project-coordinator">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => u.isActive)
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Observação</Label>
                  <Textarea
                    id="edit-description"
                    data-testid="input-edit-proposal-description"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={3}
                    placeholder=""
                    className="resize-y"
                    style={observationTextareaStyle}
                    onMouseUp={(e) => persistObservationTextareaSize(e.currentTarget)}
                    onPointerUp={(e) => persistObservationTextareaSize(e.currentTarget)}
                    onBlur={(e) => persistObservationTextareaSize(e.currentTarget)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-proposalOrigin">Código da proposta antigo</Label>
                  <Input
                    id="edit-proposalOrigin"
                    data-testid="input-edit-proposal-origin"
                    value={editFormData.proposalOrigin}
                    onChange={(e) => setEditFormData({ ...editFormData, proposalOrigin: e.target.value })}
                    placeholder=""
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50">
                  Cancelar
                </Button>
                {editDisabledReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="submit"
                          data-testid="button-save-edit-proposal"
                          disabled={updateMutation.isPending || !isEditDirty || !isEditValid}
                        >
                          {updateMutation.isPending ? 'Salvando...' : 'Confirmar'}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="end"
                      avoidCollisions
                      collisionPadding={16}
                      className="max-w-[min(20rem,calc(100vw-2rem))] whitespace-pre-line break-words text-left"
                    >
                      {editDisabledReason}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    type="submit"
                    data-testid="button-save-edit-proposal"
                    disabled={updateMutation.isPending || !isEditDirty || !isEditValid}
                  >
                    {updateMutation.isPending ? 'Salvando...' : 'Confirmar'}
                  </Button>
                )}
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
