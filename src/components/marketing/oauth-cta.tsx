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
  if (isLoggedIn) {
    return (
      <Button
        size={size}
        asChild
        className={cn(
          onDark &&
            "bg-white text-[#1b2d6f] shadow-md hover:bg-white/90 hover:text-[#1b2d6f]",
          className,
        )}
      >
        <Link href={dashboardHref} className="gap-2">
          Ir para o dashboard
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size={size}
      asChild
      className={cn(
        "border-2 border-amber-400 bg-white text-[#1b2d6f] shadow-md hover:border-amber-300 hover:bg-amber-50",
        className,
      )}
    >
      <a href={SIGNIN} className="gap-2">
        Testar grátis
        <ArrowRight className="size-4" />
      </a>
    </Button>
  );
}
