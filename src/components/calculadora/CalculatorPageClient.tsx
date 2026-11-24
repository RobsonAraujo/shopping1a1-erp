"use client";

import Link from "next/link";
import {
  Activity,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowLeft, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalculatorListingPicker } from "@/components/calculadora/CalculatorListingPicker";
import { CalculatorPanel } from "@/components/calculadora/CalculatorPanel";
import type { CalculatorApi } from "@/lib/calculadora/calculator-api";
import {
  CALCULATOR_PARAM,
  calculatorProductKey,
  groupCalculatorListings,
  normalizeListingParam,
  type CalculatorData,
} from "@/lib/calculadora/calculator-listings";
import type { TacosBasis } from "@/lib/calculadora/reading";
import { cn } from "@/lib/utils";

const RECENTS_KEY = "calculadora:recentes";
/** Recentes nos chips e calculadoras mantidas vivas (leitura e cotações preservadas). */
const RECENTS_MAX = 5;
/** Avisa quem lê a URL depois de um push/replace nosso (o `popstate` só vem do navegador). */
const URL_EVENT = "calculadora:url";

function subscribeUrl(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_EVENT, onChange);
  };
}

/** Demonstração: a seleção não mora na URL. */
const subscribeNothing = () => () => {};
const readNothing = () => null;

function readUrlParam(): string | null {
  return normalizeListingParam(new URLSearchParams(window.location.search).get(CALCULATOR_PARAM));
}

/**
 * Troca o anúncio na URL sem refazer o servidor. O Next sincroniza o
 * `pushState`/`replaceState` nativo com o roteador dele.
 */
function navigateTo(id: string | null, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set(CALCULATOR_PARAM, id);
  else params.delete(CALCULATOR_PARAM);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(URL_EVENT));
}

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, RECENTS_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeRecents(ids: string[]) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(ids));
  } catch {
    // Navegação privada / armazenamento bloqueado: os recentes só não persistem.
  }
}

function pushFront(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((entry) => entry !== id)].slice(0, RECENTS_MAX);
}

/** Desktop com mouse: só aí vale focar campo sozinho (no celular abriria o teclado). */
function prefersAutoFocus(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Calculadora (Financeiro): mestre-detalhe com todos os anúncios à esquerda e
 * a calculadora à direita; no celular, duas telas. A URL guarda o anúncio
 * aberto. Abrir a página não chama o Mercado Livre; abrir um anúncio o lê
 * agora (clique ou Enter — ↑/↓ na lista não). As últimas calculadoras abertas
 * ficam montadas (`<Activity>`): voltar a uma delas não lê nem cota de novo.
 * A base do TACOS (hoje ou 7 dias) vale para todos os anúncios da visita.
 */
export function CalculatorPageClient({
  data,
  initialSelectedId,
  variant = "page",
  api,
}: {
  data: CalculatorData;
  /** `?anuncio=` lido no servidor (a primeira renderização bate com a URL). */
  initialSelectedId: string | null;
  /**
   * `page` = a página do Financeiro (URL, recentes no navegador, atalho "/",
   * painéis presos na tela). `demo` = dentro da landing: seleção local, nada
   * gravado, sem atalhos globais e altura fixa.
   */
  variant?: "page" | "demo";
  /** Leitura e simulações locais (demonstração); padrão: as rotas. */
  api?: CalculatorApi;
}) {
  const isPage = variant === "page";
  const urlSelectedId = useSyncExternalStore(
    isPage ? subscribeUrl : subscribeNothing,
    isPage ? readUrlParam : readNothing,
    () => (isPage ? initialSelectedId : null),
  );
  const [localSelectedId, setLocalSelectedId] = useState(initialSelectedId);
  const selectedId = isPage ? urlSelectedId : localSelectedId;
  const byId = useMemo(
    () => new Map(data.listings.map((listing) => [listing.mlItemId, listing])),
    [data.listings],
  );
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  // Opções de venda: as opções de cada produto, para a troca no cabeçalho.
  const optionsByProduct = useMemo(
    () =>
      new Map(
        groupCalculatorListings(data.listings, data.listings)
          .filter((group) => group.options.length > 1)
          .map((group) => [group.key, group.options]),
      ),
    [data.listings],
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const priceInputs = useRef(new Map<string, HTMLInputElement>());
  /** Anúncio cujo campo de preço deve receber o foco quando aparecer. */
  const pendingFocus = useRef<string | null>(null);
  /** Esta visita empilhou a calculadora no histórico (o "← Anúncios" pode voltar). */
  const pushedEntry = useRef(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [aliveIds, setAliveIds] = useState<string[]>(() =>
    initialSelectedId ? [initialSelectedId] : [],
  );
  /** Cada visita começa no TACOS de hoje; a escolha vale para os próximos anúncios. */
  const [tacosBasis, setTacosBasis] = useState<TacosBasis>("today");
  // Voltar/avançar do navegador também abre um anúncio: entra nas vivas na hora.
  const renderIds =
    selected && !aliveIds.includes(selected.mlItemId)
      ? pushFront(aliveIds, selected.mlItemId)
      : aliveIds;

  // Recentes do navegador: lidos depois de montar (o servidor não os conhece).
  useEffect(() => {
    if (!isPage) return;
    const stored = readRecents();
    const next = initialSelectedId && byId.has(initialSelectedId)
      ? pushFront(stored, initialSelectedId)
      : stored;
    if (next !== stored) writeRecents(next);
    setRecentIds(next);
    // Só na montagem: depois, quem atualiza é `select`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop: a busca já abre com foco quando não há anúncio aberto.
  useEffect(() => {
    if (isPage && !initialSelectedId && prefersAutoFocus()) searchInputRef.current?.focus();
  }, [isPage, initialSelectedId]);

  // "/" leva à busca de qualquer lugar da página (fora de campos).
  useEffect(() => {
    if (!isPage) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPage]);

  // Foco no preço depois de escolher: o campo só existe depois do commit.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || id !== selected?.mlItemId) return;
    const input = priceInputs.current.get(id);
    if (!input) return;
    pendingFocus.current = null;
    input.focus();
    input.select();
  }, [selected, renderIds]);

  const select = useCallback(
    (mlItemId: string, options: { viaKeyboard: boolean }) => {
      const wantsFocus = options.viaKeyboard || prefersAutoFocus();
      if (mlItemId === selectedId) {
        const input = priceInputs.current.get(mlItemId);
        if (wantsFocus && input) {
          input.focus();
          input.select();
        }
        return;
      }
      pendingFocus.current = wantsFocus ? mlItemId : null;
      if (!isPage) {
        setLocalSelectedId(mlItemId);
      } else if (selectedId) {
        // Trocar de anúncio só substitui, sem encher o histórico.
        navigateTo(mlItemId, "replace");
      } else {
        // Entrar na calculadora empilha: o voltar do celular volta à lista.
        navigateTo(mlItemId, "push");
        pushedEntry.current = true;
      }
      setAliveIds((current) => pushFront(current, mlItemId));
      setRecentIds((current) => {
        const next = pushFront(current, mlItemId);
        if (isPage) writeRecents(next);
        return next;
      });
    },
    [isPage, selectedId],
  );

  function backToList() {
    if (!isPage) {
      setLocalSelectedId(null);
    } else if (pushedEntry.current) {
      pushedEntry.current = false;
      window.history.back();
    } else {
      // Abriu pelo link: não há para onde voltar nesta página.
      navigateTo(null, "replace");
    }
  }

  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((listing) => listing !== undefined);
  const priceRefFor = (id: string) => (node: HTMLInputElement | null) => {
    if (node) priceInputs.current.set(id, node);
    else priceInputs.current.delete(id);
  };

  if (data.listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
        Nenhum anúncio ativo na loja ainda. Os anúncios aparecem aqui depois da
        sincronização com o Mercado Livre, em{" "}
        <Link
          href="/dashboard/produtos"
          className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
        >
          Meus produtos
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section
        aria-label="Anúncios"
        className={cn(
          "flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm",
          isPage
            ? "lg:sticky lg:top-24 lg:flex lg:h-[calc(100dvh-7.5rem)] lg:overflow-hidden"
            : "lg:flex lg:h-[36rem] lg:overflow-hidden",
          selected ? "hidden" : "flex",
        )}
      >
        <CalculatorListingPicker
          listings={data.listings}
          selectedId={selected?.mlItemId ?? null}
          recents={recents}
          onSelect={select}
          searchInputRef={searchInputRef}
          stickySearch={isPage}
        />
      </section>

      <section
        aria-label="Calculadora"
        className={cn(
          "min-w-0 lg:block lg:overflow-y-auto",
          isPage ? "lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7.5rem)]" : "lg:h-[36rem]",
          selected ? "block" : "hidden",
        )}
      >
        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={backToList}
            className="mb-2 -ml-2 lg:hidden"
          >
            <ArrowLeft aria-hidden />
            Anúncios
          </Button>
        ) : null}

        {renderIds.map((id) => {
          const listing = byId.get(id);
          if (!listing) return null;
          return (
            <Activity key={id} mode={id === selected?.mlItemId ? "visible" : "hidden"}>
              <CalculatorPanel
                listing={listing}
                timeZone={data.timeZone}
                basis={tacosBasis}
                onBasisChange={setTacosBasis}
                priceInputRef={priceRefFor(id)}
                api={api}
                demo={!isPage}
                options={optionsByProduct.get(calculatorProductKey(listing))}
                onSelectOption={(mlItemId) => select(mlItemId, { viaKeyboard: false })}
              />
            </Activity>
          );
        })}

        {!selected ? (
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 px-6 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
              <Calculator className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {selectedId ? `O anúncio ${selectedId} não está na lista` : "Escolha um anúncio"}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">
              Clique num anúncio da lista, ou digite o SKU ou o MLB e aperte Enter. Depois é
              só digitar o preço e Enter de novo.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
