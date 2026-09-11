import { Skeleton } from "@/components/ui/skeleton";

export function KanbanFullscreenSkeleton({
  title,
  background,
}: {
  title: string;
  background?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex h-screen flex-col bg-[var(--background)] pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={background ? { background } : undefined}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/15 px-4 py-3 sm:px-6">
          <Skeleton className="size-8 rounded-md bg-white/20" />
          <Skeleton className="size-8 rounded-md bg-white/20" />
          <h2 className="min-w-0 truncate text-lg font-semibold text-white">{title}</h2>
          <Skeleton className="ml-auto h-8 w-36 rounded-md bg-white/20" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-10 w-64 rounded-lg bg-white/25" />
            <Skeleton className="h-8 w-28 rounded-md bg-white/25" />
          </div>
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="w-[85vw] shrink-0 space-y-2 rounded-xl border border-white/15 bg-white/10 p-2 sm:w-72"
              >
                <Skeleton className="h-9 w-full rounded-lg bg-white/25" />
                {Array.from({ length: 2 }).map((_, j) => (
                  <Skeleton key={j} className="h-32 w-full rounded-lg bg-white/20" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
