import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { GripVertical, Minus, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { headerShortcutItems } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const MAX_HEADER_SHORTCUTS = 4;

export function HeaderShortcutManager() {
  const [, setLocation] = useLocation();
  const { hasRole } = useAuth();
  const { headerShortcutPaths, setHeaderShortcutPaths, isSaving } = usePreferences();
  const [open, setOpen] = useState(false);
  const [draftPaths, setDraftPaths] = useState<string[]>(headerShortcutPaths);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const availableItems = useMemo(
    () => headerShortcutItems.filter((item) => item.roles.length === 0 || hasRole(item.roles)),
    [hasRole]
  );

  const selectedItems = useMemo(
    () => draftPaths
      .map((path) => availableItems.find((item) => item.path === path) ?? null)
      .filter((item): item is (typeof availableItems)[number] => Boolean(item)),
    [availableItems, draftPaths]
  );

  const addableItems = useMemo(
    () => availableItems.filter((item) => !draftPaths.includes(item.path)),
    [availableItems, draftPaths]
  );

  useEffect(() => {
    if (!open) return;
    setDraftPaths(headerShortcutPaths);
  }, [headerShortcutPaths, open]);

  const removeShortcut = (path: string) => {
    setDraftPaths((current) => current.filter((item) => item !== path));
  };

  const addShortcut = (path: string) => {
    setDraftPaths((current) => {
      if (current.includes(path)) return current;
      if (current.length >= MAX_HEADER_SHORTCUTS) return current;
      return [...current, path];
    });
  };

  const moveShortcut = (sourcePath: string, targetPath: string) => {
    setDraftPaths((current) => {
      const sourceIndex = current.indexOf(sourcePath);
      const targetIndex = current.indexOf(targetPath);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return current;

      const next = [...current];
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const handleSelectedDragStart = (path: string) => {
    setDraggingPath(path);
    setDragOverPath(path);
  };

  const handleSelectedDragEnter = (path: string) => {
    if (!draggingPath || draggingPath === path) return;
    setDragOverPath(path);
    moveShortcut(draggingPath, path);
  };

  const handleSelectedDragEnd = () => {
    setDraggingPath(null);
    setDragOverPath(null);
  };

  const saveShortcuts = async () => {
    await setHeaderShortcutPaths(draftPaths);
    setOpen(false);
  };

  return (
    <>
      {selectedItems.map((item) => {
        const Icon = item.icon;
        return (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid={`button-header-shortcut-${item.path.replace(/[^a-z0-9]/gi, '-')}`}
                onClick={() => setLocation(item.path)}
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                <Icon className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{item.label}</TooltipContent>
          </Tooltip>
        );
      })}

      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-header-shortcut-picker"
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Personalizar atalhos</TooltipContent>
        </Tooltip>

        <DialogContent className="max-w-2xl border-border bg-background p-0 shadow-2xl">
          <div className="max-h-[85vh] overflow-y-auto px-6 pb-6 pt-6">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="pr-8 text-foreground">Personalizar atalhos</DialogTitle>
              <DialogDescription>
                Monte seus atalhos do header escolhendo ate {MAX_HEADER_SHORTCUTS} itens do menu lateral.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-6">
              <section>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">Seus atalhos</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Arraste os atalhos para definir a ordem no header.</p>
                  </div>
                  <div className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {selectedItems.length}/{MAX_HEADER_SHORTCUTS}
                  </div>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                    Nenhum atalho selecionado ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {selectedItems.map((item) => {
                      const Icon = item.icon;
                      const isDragging = draggingPath === item.path;
                      const isDragOver = dragOverPath === item.path;
                      return (
                        <div key={item.path} className="flex flex-col items-center text-center">
                          <div
                            draggable={!isSaving}
                            onDragStart={() => handleSelectedDragStart(item.path)}
                            onDragEnter={() => handleSelectedDragEnter(item.path)}
                            onDragOver={(event) => event.preventDefault()}
                            onDragEnd={handleSelectedDragEnd}
                            onDrop={handleSelectedDragEnd}
                            className={cn(
                              'relative flex h-16 w-16 cursor-grab items-center justify-center rounded-lg border bg-card shadow-sm transition-all active:cursor-grabbing',
                              isDragging ? 'scale-95 border-primary/40 opacity-60 shadow-none' : 'border-border hover:bg-muted/40',
                              isDragOver && !isDragging ? 'border-primary bg-primary/5 shadow-md' : ''
                            )}
                            data-testid={`draggable-header-shortcut-${item.path.replace(/[^a-z0-9]/gi, '-')}`}
                          >
                            <button
                              type="button"
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                              onClick={() => removeShortcut(item.path)}
                              disabled={isSaving}
                              data-testid={`button-remove-shortcut-${item.path.replace(/[^a-z0-9]/gi, '-')}`}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <div className="absolute left-1.5 top-1.5 text-muted-foreground/70">
                              <GripVertical className="h-3.5 w-3.5" />
                            </div>
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="mt-2 text-xs font-medium text-foreground">{item.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <Separator />

              <section>
                <div className="mb-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">Adicionar atalho</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Escolha novos acessos rapidos a partir dos itens disponiveis.</p>
                </div>

                {addableItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                    Todos os atalhos disponiveis ja foram adicionados.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {addableItems.map((item) => {
                      const Icon = item.icon;
                      const disabled = selectedItems.length >= MAX_HEADER_SHORTCUTS;
                      return (
                        <div key={item.path} className={cn('flex flex-col items-center text-center', disabled && 'opacity-45')}>
                          <button
                            type="button"
                            className="relative flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted/40 disabled:cursor-not-allowed"
                            onClick={() => addShortcut(item.path)}
                            disabled={isSaving || disabled}
                          >
                            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                              <Plus className="h-3 w-3" />
                            </span>
                            <Icon className="h-5 w-5 text-primary" />
                          </button>
                          <div className="mt-2 text-xs font-medium text-foreground">{item.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <DialogFooter className="gap-3 pt-1 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-28"
                  onClick={() => setOpen(false)}
                  disabled={isSaving}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  className="min-w-28"
                  onClick={() => void saveShortcuts()}
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}