import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Placeholder estático (cor --muted) — sem custo de processar blur por
 * imagem no servidor. Só preenche o espaço até a thumbnail real chegar.
 * Base64 fixo (não usa `Buffer`, que não existe no bundle do client).
 */
const BLUR_PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2VlZjBmNiIvPjwvc3ZnPg==";

export function ProductThumbnail({
  src,
  alt,
  size = 40,
  className,
}: {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          className="size-full object-contain"
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          loading="lazy"
        />
      ) : (
        <ImageOff
          className="size-3.5 text-[var(--muted-foreground)]"
          aria-hidden
        />
      )}
    </span>
  );
}
