import type { CategoryBody } from "@/lib/mercadolibre/types";

export function formatCategoryPath(category: CategoryBody): string {
  if (category.path_from_root?.length) {
    return category.path_from_root.map((segment) => segment.name).join(" › ");
  }
  return category.name;
}
