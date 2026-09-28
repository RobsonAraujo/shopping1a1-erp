"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useHomeLayout } from "@/components/home/dashboard/HomeDashboardProvider";
import {
  MAX_DASHBOARD_VIEWS,
  createView,
  deleteView,
  renameView,
  setDefaultView,
} from "@/lib/home/dashboard/dashboard-preferences";
import { cn } from "@/lib/utils";

/**
 * Seletor de versões do dashboard ("Robson", "Jhonattan"…).
 *
 * A versão marcada com estrela é a **principal**: é nela que o app abre. Trocar
 * de versão é visita temporária e não persiste — por isso, quando a pessoa está
 * visitando outra, o header avisa e oferece tornar principal. Sem esse aviso a
 * não-persistência é genuinamente surpreendente.
 */
export function HomeViewSwitcher() {
  const {
    preferences,
    view,
    activeViewId,
    setActiveViewId,
    update,
  } = useHomeLayout();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [copyCurrent, setCopyCurrent] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const views = preferences.views;
  const atLimit = views.length >= MAX_DASHBOARD_VIEWS;

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    // `createView` antes do `update`, não dentro dele: efeito colateral dentro
    // de um updater só funciona porque `update` executa o callback uma vez, de
    // forma síncrona — é frágil de ler e quebraria se isso mudasse.
    const result = createView(preferences, {
      name,
      copyFromViewId: copyCurrent ? activeViewId : undefined,
    });
    if (!result.viewId) {
      toast.error(`Limite de ${MAX_DASHBOARD_VIEWS} versões atingido.`);
      setCreating(false);
      return;
    }
    update(result.preferences);
    setActiveViewId(result.viewId);
    toast.success(`Versão «${name}» criada.`);
    setNewName("");
    setCreating(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-48">
          <span className="min-w-0 truncate">{view.name}</span>
          {view.id === preferences.defaultViewId ? (
            <Star
              className="ml-1.5 size-3.5 shrink-0 fill-amber-400 text-amber-500"
              aria-label="Versão principal"
            />
          ) : null}
          <ChevronDown className="ml-1 size-4 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-2" align="end">
        <p className="px-2 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
          Versões do início
        </p>
        <ul>
          {views.map((item) => {
            const isDefault = item.id === preferences.defaultViewId;
            const isActive = item.id === activeViewId;
            return (
              <li key={item.id} className="rounded-lg hover:bg-[var(--muted)]/50">
                {renamingId === item.id ? (
                  <div className="p-2">
                    <FormInput
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          update((prefs) => renameView(prefs, item.id, renameValue));
                          setRenamingId(null);
                        }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => {
                        update((prefs) => renameView(prefs, item.id, renameValue));
                        setRenamingId(null);
                      }}
                      aria-label={`Renomear ${item.name}`}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveViewId(item.id);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm"
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          isActive
                            ? "text-[var(--primary)]"
                            : "text-transparent",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{item.name}</span>
                    </button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        update((prefs) => setDefaultView(prefs, item.id));
                        toast.success(`«${item.name}» é a versão principal.`);
                      }}
                      aria-label={
                        isDefault
                          ? `${item.name} já é a principal`
                          : `Tornar ${item.name} a principal`
                      }
                      disabled={isDefault}
                    >
                      <Star
                        className={cn(
                          "size-3.5",
                          isDefault && "fill-amber-400 text-amber-500",
                        )}
                        aria-hidden
                      />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setRenamingId(item.id);
                        setRenameValue(item.name);
                      }}
                      aria-label={`Renomear ${item.name}`}
                    >
                      <span className="text-xs">Aa</span>
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={views.length <= 1}
                          aria-label={`Excluir ${item.name}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Excluir a versão «{item.name}»?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            O layout desta versão é perdido. As outras versões
                            continuam como estão.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              update((prefs) => deleteView(prefs, item.id));
                              toast.success(`«${item.name}» excluída.`);
                            }}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-1 border-t border-[var(--border)] pt-2">
          {creating ? (
            <div className="space-y-2 p-1">
              <FormInput
                autoFocus
                label="Nome da versão"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Ex.: Robson"
              />
              <label className="flex items-center justify-between gap-2 px-1 text-xs text-[var(--muted-foreground)]">
                Copiar o layout atual
                <Switch
                  checked={copyCurrent}
                  onCheckedChange={setCopyCurrent}
                  aria-label="Copiar o layout atual"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                  Criar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setCreating(true)}
              disabled={atLimit}
            >
              <Plus className="mr-1.5 size-4" aria-hidden />
              {atLimit ? `Limite de ${MAX_DASHBOARD_VIEWS} versões` : "Nova versão"}
            </Button>
          )}
        </div>

        <p className="px-2 pt-2 text-xs leading-snug text-[var(--muted-foreground)]">
          <Copy className="mr-1 inline size-3" aria-hidden />
          Ao recarregar, o início sempre abre na versão principal (estrela).
        </p>
      </PopoverContent>
    </Popover>
  );
}
