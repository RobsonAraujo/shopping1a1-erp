import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Miniatura do anúncio (fundo neutro, `object-contain`: foto de produto não corta). */
export function RotinaThumb({
  src,
  size,
  className,
}: {
  src: string | null;
  /** Lado em px da imagem pedida ao otimizador. */
  size: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--muted)]",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-contain"
          sizes={`${size}px`}
        />
      ) : (
        <ImageOff className="size-1/2 max-h-4 max-w-4 text-[var(--muted-foreground)]/70" aria-hidden />
      )}
    </span>
  );
}
