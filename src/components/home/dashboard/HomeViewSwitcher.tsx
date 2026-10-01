"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
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
 * Seletor de versões do início ("Robson", "Jhonattan"…), em **pills**.
 *
 * Era um dropdown: o nome da versão atual mais um menu com tudo dentro. Trocou
 * por uma barra de pills porque isto não é um formulário com N opções, é a
 * navegação de um workspace — as versões disponíveis ficam **à vista** e trocar
 * custa um clique, em vez de abrir, procurar e clicar.
 *
 * Duas decisões de interação:
 *
 * 1. **A pill ativa não navega, ela abre as ações** (renomear, tornar principal,
 *    excluir). Clicar na versão em que você já está não faria nada, então aquele
 *    alvo rende mais como menu — e evita botão dentro de botão, que é HTML
 *    inválido.
 * 2. **A estrela fica na pill**, não escondida no menu. Qual versão abre ao
 *    recarregar é a informação que mais confunde nesta feature; ela precisa
 *    estar visível sem clique.
 *
 * No celular a barra rola na horizontal em vez de quebrar linha — é o padrão de
 * chips que o próprio Mercado Livre usa, e mantém o cabeçalho com uma altura só.
 */

const PILL_BASE =
  "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:outline-none";

export function HomeViewSwitcher() {
  const { preferences, activeViewId, setActiveViewId, update } = useHomeLayout();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [copyCurrent, setCopyCurrent] = useState(true);

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

  function commitRename(viewId: string) {
    update((prefs) => renameView(prefs, viewId, renameValue));
    setRenamingId(null);
  }

  return (
    <div
      role="group"
      aria-label="Versões do início"
      className={cn(
        "flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[var(--muted)]/60 p-1",
        // Rolagem sem barra visível: a barra de scroll dentro de uma pill bar de
        // 36px de altura come metade do controle.
        "[-ms-overflow-style:none] [scrollbar-width:none]",
      )}
    >
      {views.map((item) => {
        const isActive = item.id === activeViewId;
        const isDefault = item.id === preferences.defaultViewId;
        const canDelete = views.length > 1;

        if (!isActive) {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveViewId(item.id)}
              aria-label={`Abrir versão ${item.name}`}
              className={cn(
                PILL_BASE,
                "text-[var(--muted-foreground)] hover:bg-[var(--card)]/60 hover:text-[var(--foreground)]",
              )}
            >
              {isDefault ? (
                <Star
                  className="size-3 shrink-0 fill-amber-400 text-amber-500"
                  aria-label="principal"
                />
              ) : null}
              <span className="max-w-32 truncate">{item.name}</span>
            </button>
          );
        }

        return (
          <Popover
            key={item.id}
            open={menuFor === item.id}
            onOpenChange={(open) => {
              setMenuFor(open ? item.id : null);
              if (!open) setRenamingId(null);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-current="true"
                aria-label={`Ações da versão ${item.name}`}
                className={cn(
                  PILL_BASE,
                  "bg-[var(--card)] text-[var(--foreground)] shadow-sm ring-1 ring-[var(--border)]",
                )}
              >
                {isDefault ? (
                  <Star
                    className="size-3 shrink-0 fill-amber-400 text-amber-500"
                    aria-label="principal"
                  />
                ) : null}
                <span className="max-w-32 truncate">{item.name}</span>
                <MoreHorizontal
                  className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden
                />
              </button>
            </PopoverTrigger>

            <PopoverContent className="w-64 p-1.5" align="start">
              {renamingId === item.id ? (
                <div className="p-1">
                  <FormInput
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(item.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => commitRename(item.id)}
                    aria-label={`Renomear ${item.name}`}
                  />
                </div>
              ) : (
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    disabled={isDefault}
                    onClick={() => {
                      update((prefs) => setDefaultView(prefs, item.id));
                      toast.success(`«${item.name}» é a versão principal.`);
                      setMenuFor(null);
                    }}
                  >
                    <Star
                      className={cn(
                        "mr-2 size-4",
                        isDefault && "fill-amber-400 text-amber-500",
                      )}
                      aria-hidden
                    />
                    {isDefault ? "Já é a principal" : "Tornar principal"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setRenamingId(item.id);
                      setRenameValue(item.name);
                    }}
                  >
                    <Pencil className="mr-2 size-4" aria-hidden />
                    Renomear
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start text-[var(--destructive)]"
                        disabled={!canDelete}
                      >
                        <Trash2 className="mr-2 size-4" aria-hidden />
                        {canDelete ? "Excluir versão" : "Única versão"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Excluir a versão «{item.name}»?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          O layout desta versão é perdido, para todos. As outras
                          versões continuam como estão.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            update((prefs) => deleteView(prefs, item.id));
                            toast.success(`«${item.name}» excluída.`);
                            setMenuFor(null);
                          }}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <p className="mt-1 border-t border-[var(--border)] px-2 pt-2 text-xs leading-snug text-[var(--muted-foreground)]">
                    Ao recarregar, o início abre na versão com estrela — a escolha
                    é deste navegador.
                  </p>
                </div>
              )}
            </PopoverContent>
          </Popover>
        );
      })}

      <Popover
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) setNewName("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={atLimit}
            aria-label={
              atLimit
                ? `Limite de ${MAX_DASHBOARD_VIEWS} versões atingido`
                : "Nova versão do início"
            }
            title={atLimit ? `Limite de ${MAX_DASHBOARD_VIEWS} versões` : "Nova versão"}
            className={cn(
              PILL_BASE,
              "px-2 text-[var(--muted-foreground)] hover:bg-[var(--card)]/60 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-72 space-y-2 p-3" align="end">
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
          <label className="flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
