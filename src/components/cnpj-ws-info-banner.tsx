import { Card } from "@/components/ui/card";
import {
  CNPJ_WS_BANNER_BODY,
  CNPJ_WS_BANNER_TITLE,
} from "@/lib/tax-report/contributor/user-messages";

export function CnpjWsInfoBanner() {
  return (
    <Card className="border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-950">
      <p className="font-medium">{CNPJ_WS_BANNER_TITLE}</p>
      <p className="mt-1 text-xs leading-relaxed">{CNPJ_WS_BANNER_BODY}</p>
      <p className="mt-2 text-xs leading-relaxed">
        Se o ML não trouxer esse dado, assumimos{" "}
        <strong>não-contribuinte</strong> (DIFAL), por segurança. Para consultar
        CNPJs direto na Receita Federal, dá para ativar a integração com a{" "}
        <a
          href="https://www.cnpj.ws/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2 hover:text-sky-800"
        >
          CNPJ.ws
        </a>{" "}
        (serviço pago) — consulte o preço do plano antes de solicitar a
        ativação.
      </p>
    </Card>
  );
}
