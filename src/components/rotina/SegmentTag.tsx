import { SEGMENT_VISUALS } from "@/components/rotina/rule-visuals";
import type { RotinaSegment } from "@/lib/rotina/rule-registry";
import { cn } from "@/lib/utils";

/** Etiqueta "Próprio" / "Catálogo" — diz em que tipo de anúncio você está mexendo. */
export function SegmentTag({
  segment,
  className,
}: {
  segment: RotinaSegment;
  className?: string;
}) {
  const visual = SEGMENT_VISUALS[segment];
  const Icon = visual.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        visual.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {visual.label}
    </span>
  );
}
