import Link from "next/link";
import { ArrowRight, ChartNoAxesColumn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CatalogLosingStripProps = {
  losingCount: number;
  sampleTitles: Array<{ mlItemId: string; label: string }>;
};

export function CatalogLosingStrip({
  losingCount,
  sampleTitles,
}: CatalogLosingStripProps) {
  if (losingCount === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Catálogo
        </h2>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
                <ChartNoAxesColumn className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Nenhum anúncio perdendo
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Com base no último status sincronizado.
                </p>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
            >
              <Link href="/dashboard/catalog-report">
                Ver catálogo
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Catálogo
      </h2>
      <Card className="border-rose-200/80 bg-rose-50/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-900">
              <ChartNoAxesColumn className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-rose-950">
                {losingCount}{" "}
                {losingCount === 1
                  ? "anúncio perdendo"
                  : "anúncios perdendo"}{" "}
                no catálogo
              </p>
              {sampleTitles.length > 0 ? (
                <p className="mt-1 truncate text-xs text-rose-900/80">
                  {sampleTitles.map((row) => row.label).join(" · ")}
                  {losingCount > sampleTitles.length ? "…" : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-rose-900/80">
                  Revise preços para recuperar a buy box.
                </p>
              )}
            </div>
          </div>
          <Button asChild size="sm" className="w-full gap-1.5">
            <Link href="/dashboard/catalog-report">
              Abrir catálogo
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
