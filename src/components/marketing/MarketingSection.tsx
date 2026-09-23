import { cn } from "@/lib/utils";

/**
 * Casca única das seções de marketing. Antes cada página repetia o mesmo
 * `<section className="scroll-mt-20 bg-... px-4 py-16 ...">` + `<h2>` + lead,
 * com espaçamentos e tons de eyebrow levemente diferentes em cada arquivo.
 */

type Surface = "base" | "card" | "tint";

const SURFACE: Record<Surface, string> = {
  base: "bg-[var(--background)]",
  card: "bg-white",
  tint: "bg-gradient-to-b from-[var(--background)] via-white to-[var(--background)]",
};

export type EyebrowTone = "primary" | "amber" | "sky" | "violet" | "emerald";

const EYEBROW_TONE: Record<EyebrowTone, string> = {
  primary: "text-[var(--primary)] before:bg-[var(--primary)]",
  amber: "text-amber-700 before:bg-amber-500",
  sky: "text-sky-700 before:bg-sky-500",
  violet: "text-violet-700 before:bg-violet-500",
  emerald: "text-emerald-700 before:bg-emerald-500",
};

export function Eyebrow({
  tone = "primary",
  className,
  children,
}: {
  tone?: EyebrowTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]",
        "before:h-px before:w-6 before:shrink-0 before:content-['']",
        EYEBROW_TONE[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  eyebrowTone,
  title,
  lead,
  align = "start",
  className,
  children,
}: {
  eyebrow?: string;
  eyebrowTone?: EyebrowTone;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "start" | "center";
  className?: string;
  /** Conteúdo extra abaixo do lead (links de apoio, ressalvas). */
  children?: React.ReactNode;
}) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        "max-w-2xl",
        centered && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow tone={eyebrowTone} className={cn(centered && "justify-center")}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <h2
        className={cn(
          "text-balance text-[clamp(1.6rem,3.4vw,2.35rem)] font-bold leading-[1.15] tracking-tight text-[var(--primary)]",
          eyebrow && "mt-3",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-pretty text-[15px] leading-relaxed text-[var(--muted-foreground)] sm:text-base">
          {lead}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function MarketingSection({
  id,
  surface = "base",
  eyebrow,
  eyebrowTone,
  title,
  lead,
  align,
  width = "wide",
  headingExtra,
  className,
  children,
}: {
  id?: string;
  surface?: Surface;
  eyebrow?: string;
  eyebrowTone?: EyebrowTone;
  title?: React.ReactNode;
  lead?: React.ReactNode;
  align?: "start" | "center";
  width?: "wide" | "narrow";
  headingExtra?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24",
        SURFACE[surface],
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto",
          width === "wide" ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        {title ? (
          <SectionHeading
            eyebrow={eyebrow}
            eyebrowTone={eyebrowTone}
            title={title}
            lead={lead}
            align={align}
          >
            {headingExtra}
          </SectionHeading>
        ) : null}
        {children ? (
          <div className={cn(title && "mt-10 sm:mt-12")}>{children}</div>
        ) : null}
      </div>
    </section>
  );
}
