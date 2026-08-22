import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const SIGNIN = "/api/auth/mercadolibre/signin";

export function OAuthCta({
  isLoggedIn,
  dashboardHref,
  size = "lg",
  onDark = false,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  size?: "sm" | "lg";
  onDark?: boolean;
}) {
  if (isLoggedIn) {
    return (
      <Button
        size={size}
        asChild
        className={
          onDark
            ? "bg-white text-[#1b2d6f] shadow-md hover:bg-white/90 hover:text-[#1b2d6f]"
            : undefined
        }
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
      className="bg-amber-400 text-slate-900 shadow-md hover:bg-amber-300 hover:text-slate-900"
    >
      <a href={SIGNIN} className="gap-2">
        Testar grátis
        <ArrowRight className="size-4" />
      </a>
    </Button>
  );
}
