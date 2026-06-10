export type ListingStatusDisplay = {
  label: string;
  hint: string;
  showBadge: boolean;
  rowMuted: boolean;
};

export function getListingStatusDisplay(
  status: string,
  mlStock: number,
  warehouseStock = 0,
): ListingStatusDisplay {
  if (status === "active") {
    return {
      label: "Ativo",
      hint: "Anúncio ativo no Mercado Livre.",
      showBadge: false,
      rowMuted: false,
    };
  }

  if (status === "paused") {
    if (mlStock <= 0 && warehouseStock > 0) {
      return {
        label: "Pausado no ML — estoque no galpão",
        hint: "Anúncio pausado no Mercado Livre, mas há unidades no galpão.",
        showBadge: true,
        rowMuted: true,
      };
    }
    if (mlStock <= 0) {
      return {
        label: "Pausado — sem estoque",
        hint: "Anúncio pausado no Mercado Livre (geralmente por falta de estoque).",
        showBadge: true,
        rowMuted: true,
      };
    }
    return {
      label: "Pausado no ML",
      hint: "Anúncio pausado no Mercado Livre.",
      showBadge: true,
      rowMuted: true,
    };
  }

  return {
    label: `Status: ${status}`,
    hint: `Anúncio com status "${status}" no Mercado Livre.`,
    showBadge: true,
    rowMuted: true,
  };
}

export function countListingsByStatus(items: Array<{ status: string }>): {
  active: number;
  paused: number;
  other: number;
} {
  let active = 0;
  let paused = 0;
  let other = 0;
  for (const item of items) {
    if (item.status === "active") active += 1;
    else if (item.status === "paused") paused += 1;
    else other += 1;
  }
  return { active, paused, other };
}
