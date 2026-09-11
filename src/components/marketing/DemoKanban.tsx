"use client";

import { useState } from "react";
import Image from "next/image";
import { Maximize2, Paintbrush, Palette } from "lucide-react";
import { getKanbanColumnColor } from "@/lib/kanban/kanban-column-colors";
import { cn } from "@/lib/utils";

type BoardKind = "purchase" | "full";

type DemoItem = {
  sku: string;
  image: string;
  qty?: string;
};

type DemoCard = {
  id: string;
  title: string;
  badge?: string;
  urgent?: boolean;
  items?: DemoItem[];
  sku?: string;
  image?: string;
  meta?: string;
};

type DemoColumn = {
  id: string;
  label: string;
  colorId: string;
  cards: DemoCard[];
};

const PURCHASE_COLUMNS: DemoColumn[] = [
  {
    id: "entrada",
    label: "Entrada",
    colorId: "sky",
    cards: [
      {
        id: "tech",
        title: "Tech Importadora",
        badge: "8 a repor",
        urgent: true,
        items: [
          {
            sku: "FONE-BT-01",
            image: "/marketing/demo-fone.png",
            qty: "Comprar 40 un.",
          },
          {
            sku: "CABO-USB-C",
            image: "/marketing/demo-cabo.png",
            qty: "Comprar 120 un.",
          },
        ],
      },
    ],
  },
  {
    id: "analisando",
    label: "Analisando",
    colorId: "cyan",
    cards: [
      {
        id: "casa",
        title: "Casa & Utilidades",
        badge: "5 a repor",
        items: [
          {
            sku: "CAPA-14",
            image: "/marketing/demo-capa.png",
            qty: "Comprar 24 un.",
          },
        ],
      },
    ],
  },
  {
    id: "cotacao",
    label: "Em Cotação",
    colorId: "violet",
    cards: [
      {
        id: "audio",
        title: "Áudio Pro",
        badge: "3 a repor",
        items: [
          {
            sku: "FONE-BT-01",
            image: "/marketing/demo-fone.png",
            qty: "Comprar 16 un.",
          },
        ],
      },
    ],
  },
  {
    id: "comprado",
    label: "Comprado",
    colorId: "emerald",
    cards: [
      {
        id: "mix",
        title: "Mix Distribuidora",
        badge: "2 a repor",
        items: [
          {
            sku: "CABO-USB-C",
            image: "/marketing/demo-cabo.png",
            qty: "Comprar 60 un.",
          },
        ],
      },
    ],
  },
];

const FULL_COLUMNS: DemoColumn[] = [
  {
    id: "entrada",
    label: "Entrada",
    colorId: "sky",
    cards: [
      {
        id: "fone",
        title: "FONE-BT-01",
        sku: "MLB123456789",
        image: "/marketing/demo-fone.png",
        meta: "ML 8 · Galpão 42 · Agendar em 3d",
        urgent: true,
      },
      {
        id: "cabo",
        title: "CABO-USB-C",
        sku: "MLB987654321",
        image: "/marketing/demo-cabo.png",
        meta: "ML 14 · Galpão 90 · Agendar em 8d",
      },
    ],
  },
  {
    id: "agendado",
    label: "Agendado",
    colorId: "amber",
    cards: [
      {
        id: "capa",
        title: "CAPA-14",
        sku: "MLB456123789",
        image: "/marketing/demo-capa.png",
        meta: "ML 3 · Galpão 18 · Coleta quinta",
      },
    ],
  },
  {
    id: "coletado",
    label: "Coletado",
    colorId: "emerald",
    cards: [
      {
        id: "cabo-done",
        title: "CABO-USB-C",
        sku: "MLB112233445",
        image: "/marketing/demo-cabo.png",
        meta: "ML 2 · Galpão 40 · Aguardando Full",
      },
    ],
  },
];

function PurchaseCard({ card }: { card: DemoCard }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{card.title}</p>
          {card.badge ? (
            <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums">
              {card.badge}
            </span>
          ) : null}
        </div>
        {card.items && card.items.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {card.items.map((item) => (
              <li key={item.sku} className="flex items-center gap-2">
                <Image
                  src={item.image}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-xs">{item.sku}</span>
                {item.qty ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    {item.qty}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {card.urgent ? (
          <span className="mt-2.5 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
            Urgente
          </span>
        ) : null}
      </div>
    </article>
  );
}

function FullCard({ card }: { card: DemoCard }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          {card.image ? (
            <Image
              src={card.image}
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{card.title}</p>
            {card.sku ? (
              <p className="truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                {card.sku}
              </p>
            ) : null}
          </div>
        </div>
        {card.meta ? (
          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{card.meta}</p>
        ) : null}
        {card.urgent ? (
          <span className="mt-2 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
            Urgente
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function DemoKanban({
  defaultBoard = "purchase",
  showSwitcher = true,
}: {
  defaultBoard?: BoardKind;
  showSwitcher?: boolean;
}) {
  const [board, setBoard] = useState<BoardKind>(defaultBoard);
  const columns = board === "purchase" ? PURCHASE_COLUMNS : FULL_COLUMNS;
  const title = board === "purchase" ? "Compras" : "Operações Full";
  const subtitle =
    board === "purchase"
      ? "Por fornecedor · arraste para avançar a compra"
      : "Por SKU · do alerta até a coleta Full";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/20 bg-[#1b2d6f]/80 px-3 py-2.5 text-white sm:px-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-white/70">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {showSwitcher ? (
            <div className="mr-1 flex rounded-lg bg-white/10 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setBoard("purchase")}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1",
                  board === "purchase" ? "bg-white text-[#1b2d6f]" : "text-white/80",
                )}
              >
                Compras
              </button>
              <button
                type="button"
                onClick={() => setBoard("full")}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1",
                  board === "full" ? "bg-white text-[#1b2d6f]" : "text-white/80",
                )}
              >
                Full
              </button>
            </div>
          ) : null}
          <span
            className="hidden items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] sm:inline-flex"
            aria-hidden
          >
            <Palette className="size-3.5" />
            Fundo
          </span>
          <span
            className="hidden items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] sm:inline-flex"
            aria-hidden
          >
            <Paintbrush className="size-3.5" />
            Colunas
          </span>
          <span
            className="hidden items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] sm:inline-flex"
            aria-hidden
          >
            <Maximize2 className="size-3.5" />
            Tela cheia
          </span>
        </div>
      </div>

      <div
        className="overflow-x-auto p-3 sm:p-4"
        style={{ background: "linear-gradient(135deg, #a6e3d8, #a9c9f0)" }}
      >
        <div className="flex min-w-max gap-3">
          {columns.map((column) => {
            const color = getKanbanColumnColor(column.colorId);
            return (
              <section
                key={column.id}
                className="flex w-[min(16.5rem,calc(100vw-3.5rem))] shrink-0 flex-col overflow-hidden rounded-xl border border-black/5 bg-white/70 shadow-sm sm:w-64"
              >
                <header
                  className="flex items-center justify-between gap-2 px-3 py-2.5"
                  style={color ? { background: color.header } : undefined}
                >
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    {column.label}
                  </h3>
                  <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[11px] tabular-nums">
                    {column.cards.length}
                  </span>
                </header>
                <div className="flex flex-col gap-2 p-2">
                  {column.cards.map((card) =>
                    board === "purchase" ? (
                      <PurchaseCard key={card.id} card={card} />
                    ) : (
                      <FullCard key={card.id} card={card} />
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
