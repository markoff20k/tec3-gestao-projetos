import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineEditTitleProps {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  canEdit?: boolean;
  /** Classes de tipografia aplicadas ao texto E ao campo, para não haver salto. */
  className?: string;
  maxLength?: number;
  /** A partir daqui o contador fica âmbar. Não bloqueia. */
  recommendedLength?: number;
  placeholder?: string;
  /** Conteúdo exibido ao lado do título em leitura (ex.: o código do projeto).
   *  Some durante a edição para o campo tomar a linha inteira. */
  trailing?: React.ReactNode;
  /** Avisa o container. O modal de detalhe usa isto para segurar o Escape. */
  onEditingChange?: (editing: boolean) => void;
  'data-testid'?: string;
}

/**
 * Título que vira campo no próprio lugar.
 *
 * O texto e o campo compartilham as mesmas classes de tipografia e a mesma
 * largura, então entrar em edição não desloca nada ao redor — é o que diferencia
 * uma edição no lugar de um formulário disfarçado.
 *
 * Enter salva, Esc cancela, sair do campo salva. Textarea em vez de input porque
 * estes nomes chegam a centenas de caracteres e precisam quebrar linha.
 */
export function InlineEditTitle({
  value,
  onSave,
  canEdit = true,
  className,
  maxLength = 500,
  recommendedLength,
  placeholder = 'Sem nome',
  trailing,
  onEditingChange,
  'data-testid': testId,
}: InlineEditTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  // Evita que o blur salve quando a saída veio de Esc ou do botão cancelar.
  const cancelandoRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  // Altura acompanha o conteúdo: um nome de 300 caracteres não pode virar uma
  // caixinha de uma linha com rolagem interna.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!editing || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  useEffect(() => {
    if (!editing) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const comecar = () => {
    if (!canEdit || saving) return;
    setError(null);
    setDraft(value);
    setEditing(true);
  };

  const cancelar = () => {
    cancelandoRef.current = true;
    setEditing(false);
    setError(null);
    setDraft(value);
  };

  const salvar = async () => {
    const limpo = draft.replace(/\s+/g, ' ').trim();

    if (!limpo) {
      setError('O nome não pode ficar vazio.');
      areaRef.current?.focus();
      return;
    }
    if (limpo === value.trim()) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(limpo);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      areaRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="group/title flex min-w-0 items-start gap-1.5">
        <span className={cn('min-w-0', className)} data-testid={testId}>
          {value || <span className="text-muted-foreground">{placeholder}</span>}
        </span>

        {trailing}

        {canEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              comecar();
            }}
            // Invisível até o mouse chegar ou o teclado focar: o lápis não deve
            // competir com o título na leitura.
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/title:opacity-100"
            title="Editar nome"
            aria-label="Editar nome"
            data-testid={testId ? `${testId}-edit` : undefined}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  const restante = maxLength - draft.length;
  const acimaDoRecomendado = recommendedLength != null && draft.length > recommendedLength;

  return (
    // flex-1/min-w-0: o campo precisa tomar a largura restante da linha. Sem
    // isso o textarea encolhe para a largura intrinseca ao lado do badge do codigo.
    <div className="min-w-0 flex-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={areaRef}
        value={draft}
        maxLength={maxLength}
        rows={1}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void salvar();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            // O Radix escuta Escape no document para fechar o Dialog. Sem parar
            // o evento nativo aqui, cancelar a edicao dentro do modal de detalhe
            // fecharia o modal inteiro junto.
            e.nativeEvent.stopImmediatePropagation();
            cancelar();
          }
        }}
        onBlur={() => {
          if (cancelandoRef.current) {
            cancelandoRef.current = false;
            return;
          }
          void salvar();
        }}
        className={cn(
          'w-full resize-none overflow-hidden rounded-md border border-input bg-background px-2 py-1',
          'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:opacity-70',
          className
        )}
        data-testid={testId ? `${testId}-input` : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {saving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Salvando...
            </span>
          ) : (
            <>
              <kbd className="rounded border border-border px-1 font-sans">Enter</kbd> salva ·{' '}
              <kbd className="rounded border border-border px-1 font-sans">Esc</kbd> cancela
            </>
          )}
        </span>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[11px] tabular-nums',
              acimaDoRecomendado ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
            )}
            title={
              acimaDoRecomendado
                ? `Nomes acima de ${recommendedLength} caracteres ficam difíceis de ler nas listas.`
                : undefined
            }
          >
            {draft.length}
            {recommendedLength != null ? `/${recommendedLength}` : restante < 60 ? `/${maxLength}` : ''}
          </span>

          {/* Botões para quem usa o mouse; o teclado já resolve por Enter/Esc. */}
          <button
            type="button"
            onMouseDown={() => {
              cancelandoRef.current = true;
            }}
            onClick={cancelar}
            disabled={saving}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Cancelar"
            aria-label="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={saving}
            className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="Salvar"
            aria-label="Salvar"
            data-testid={testId ? `${testId}-save` : undefined}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error ? <p className="text-[11px] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
