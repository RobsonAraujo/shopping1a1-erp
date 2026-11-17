"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { track } from "@/lib/analytics/track";
import { normalizeLeadPhone } from "@/lib/marketing/lead-phone";

const SIGNIN = "/api/auth/mercadolibre/signin";

/**
 * Último passo antes do OAuth. É um `<form>` comum (POST + 303 para o Mercado
 * Livre), sem depender de JavaScript; o JS só valida o telefone e empurra os
 * eventos do funil antes de o navegador sair da página.
 */
export function ConnectForm({
  offer,
  errorCode,
}: {
  offer: string | null;
  errorCode: string | null;
}) {
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    track("connect_view", { offer: offer ?? undefined });
  }, [offer]);

  useEffect(() => {
    if (errorCode) track("oauth_error", { reason: errorCode });
  }, [errorCode]);

  // Voltar do Mercado Livre pelo botão do navegador restaura a página do
  // bfcache com o botão ainda em "Abrindo…".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <form
      method="post"
      action={SIGNIN}
      className="space-y-5"
      onSubmit={(e) => {
        const typed = phone.trim() !== "";
        if (typed && !normalizeLeadPhone(phone)) {
          e.preventDefault();
          setPhoneError("Confira o número com DDD, ou deixe o campo em branco.");
          return;
        }
        if (typed) track("lead_submit", { offer: offer ?? undefined });
        track("oauth_start", { has_lead: typed, offer: offer ?? undefined });
        setSubmitting(true);
      }}
    >
      {offer ? <input type="hidden" name="offer" value={offer} /> : null}

      {/* Campo isca: invisível para pessoas, robô preenche e o lead é descartado. */}
      <FormInput
        className="hidden"
        aria-hidden
        label="Site"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />

      <div className="space-y-2">
        <FormInput
          id="connect-whatsapp"
          label="Seu WhatsApp (opcional)"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(11) 98765-4321"
          value={phone}
          aria-invalid={phoneError ? true : undefined}
          aria-describedby="connect-whatsapp-help"
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneError) setPhoneError(null);
          }}
        />
        {phoneError ? (
          <p className="text-xs font-medium text-rose-700" role="alert">
            {phoneError}
          </p>
        ) : null}
        <p
          id="connect-whatsapp-help"
          className="text-xs leading-relaxed text-[var(--muted-foreground)]"
        >
          Se algo travar na conexão, a gente te chama para ajudar. Só para
          isso, sem lista de promoções.{" "}
          <Link
            href="/privacidade"
            className="underline underline-offset-2 hover:text-[var(--primary)]"
          >
            Privacidade
          </Link>
          .
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="h-12 w-full rounded-full border-0 bg-[#1b2d6f] px-7 text-[15px] font-semibold text-white shadow-none hover:bg-[#152456]"
      >
        {submitting ? "Abrindo o Mercado Livre…" : "Continuar para o Mercado Livre"}
        {submitting ? null : <ArrowRight />}
      </Button>
    </form>
  );
}
