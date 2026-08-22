import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIGNIN = "/api/auth/mercadolibre/signin";

export function OAuthCta({
  isLoggedIn,
  dashboardHref,
  size = "lg",
  onDark = false,
  className,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  size?: "sm" | "lg";
  onDark?: boolean;
  className?: string;
}) {
  const shape =
    size === "sm"
      ? "h-9 rounded-full px-4 text-sm font-semibold"
      : "h-12 rounded-full px-7 text-[15px] font-semibold";

  const appearance = isLoggedIn
    ? onDark
      ? "border-0 bg-white text-[#1b2d6f] shadow-none hover:bg-white/90"
      : "border-0 bg-[#1b2d6f] text-white shadow-none hover:bg-[#152456]"
    : "border-0 bg-amber-400 text-[#0f1a45] shadow-none hover:bg-amber-300";

  const label = isLoggedIn ? "Ir para o dashboard" : "Testar grátis";
  const href = isLoggedIn ? dashboardHref : SIGNIN;

  return (
    <Button size={size} asChild className={cn(shape, appearance, className)}>
      {isLoggedIn ? (
        <Link href={href}>
          {label}
          <ArrowRight />
        </Link>
      ) : (
        <a href={href}>
          {label}
          <ArrowRight />
        </a>
      )}
    </Button>
  );
}
