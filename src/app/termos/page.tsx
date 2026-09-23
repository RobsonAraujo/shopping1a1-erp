import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";
import { LEGAL } from "@/lib/marketing/legal";

const title = "Termos de uso";
const description =
  "Condições de uso do ERP 1a1: o que o painel faz, o que não faz, regras do beta gratuito e limites de responsabilidade.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/termos` },
  robots: { index: true, follow: true },
};

export default async function TermosPage() {
  const cookieStore = await cookies();
  const { isLoggedIn, dashboardHref } = getMarketingCtaState(cookieStore);

  return (
    <LegalPage
      isLoggedIn={isLoggedIn}
      dashboardHref={dashboardHref}
      title="Termos de uso"
      intro="As condições abaixo valem para qualquer pessoa que conecte uma conta do Mercado Livre ao ERP 1a1. Ao autorizar o aplicativo, você concorda com elas."
    >
      <LegalSection n={1} title="Quem somos e o que é o serviço">
        <p>
          O <strong>{LEGAL.productName}</strong>, operado por{" "}
          <strong>{LEGAL.legalName}</strong> (CNPJ {LEGAL.cnpj}), é um painel
          de gestão para vendedores do Mercado Livre. Ele lê dados da sua conta
          via API oficial e os combina com informações que você cadastra, para
          calcular margem por anúncio, apuração tributária, DRE mensal, kanban
          de compras e Full e relatórios de estoque.
        </p>
        <p>
          O ERP 1a1 não é afiliado ao Mercado Livre. É um aplicativo de terceiro
          que opera com a autorização que você concede.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Cadastro e acesso">
        <p>
          O acesso é feito exclusivamente pelo OAuth do Mercado Livre: não
          existe senha própria do ERP. Cada conta ML conectada pertence a uma
          única organização dentro do sistema.
        </p>
        <p>
          Você é responsável por manter a segurança da sua conta do Mercado
          Livre e por quem você autoriza a acessar o painel da sua organização.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Beta gratuito">
        <p>
          O produto está em <strong>fase beta e é oferecido sem cobrança</strong>,
          sem exigência de cartão de crédito. Durante o beta, funcionalidades
          podem ser adicionadas, alteradas ou removidas, e podem ocorrer
          instabilidades.
        </p>
        <p>
          Quando planos pagos forem lançados, você será avisado com antecedência
          por e-mail e dentro do painel. <strong>Nenhuma cobrança é feita sem
          aviso prévio e sem a sua contratação expressa.</strong>
        </p>
      </LegalSection>

      <LegalSection n={4} title="O que o painel não faz">
        <p>
          Este ponto é importante e não muda com o tempo:
        </p>
        <ul>
          <li>
            <strong>Não emitimos nota fiscal</strong> nem transmitimos
            obrigações acessórias.
          </li>
          <li>
            <strong>Não substituímos o seu contador.</strong> A apuração
            tributária do painel é um apoio ao fechamento; a responsabilidade
            fiscal permanece sua e do seu escritório contábil.
          </li>
          <li>
            <strong>Não garantimos resultado comercial.</strong> Os números são
            ferramenta de decisão, não promessa de lucro.
          </li>
        </ul>
        <p>
          Os cálculos dependem dos dados fornecidos pela API do Mercado Livre e
          dos custos, alíquotas e regimes que você cadastra. Informação
          incorreta na entrada produz resultado incorreto na saída.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Uso adequado">
        <p>Ao usar o ERP 1a1, você concorda em não:</p>
        <ul>
          <li>
            tentar acessar dados de organizações que não sejam a sua, ou
            contornar os controles de isolamento;
          </li>
          <li>
            fazer engenharia reversa, raspagem automatizada do painel ou uso que
            comprometa a estabilidade do serviço;
          </li>
          <li>
            usar o serviço para qualquer finalidade ilícita ou que viole os
            termos do próprio Mercado Livre.
          </li>
        </ul>
        <p>
          Podemos suspender ou encerrar o acesso de contas que descumpram estas
          regras.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Disponibilidade">
        <p>
          Durante o beta não oferecemos SLA de disponibilidade. O serviço
          depende também da disponibilidade e dos limites de uso da API do
          Mercado Livre, que estão fora do nosso controle.
        </p>
        <p>
          Podemos realizar manutenções, atualizações e interrupções
          programadas, buscando o menor impacto possível.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Propriedade e seus dados">
        <p>
          O software, a marca e a interface do ERP 1a1 são de titularidade de{" "}
          {LEGAL.legalName}. <strong>Os dados da sua loja continuam seus</strong>.
          Nós apenas os tratamos para prestar o serviço, conforme a{" "}
          <Link href="/privacidade">Política de privacidade</Link>.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Limitação de responsabilidade">
        <p>
          O serviço é fornecido <strong>&ldquo;no estado em que se
          encontra&rdquo;</strong> durante o beta. Na máxima extensão permitida
          pela legislação aplicável, não respondemos por lucros cessantes,
          perda de oportunidade ou danos indiretos decorrentes do uso ou da
          indisponibilidade do painel.
        </p>
        <p>
          Nada nestes termos afasta direitos que a legislação brasileira
          assegure de forma irrenunciável, inclusive os previstos no Código de
          Defesa do Consumidor quando aplicável.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Encerramento">
        <p>
          Você pode encerrar o uso a qualquer momento, revogando a autorização
          do aplicativo na sua conta do Mercado Livre e solicitando a exclusão
          da organização por{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Alterações e foro">
        <p>
          Estes termos podem ser atualizados; a data de última revisão fica no
          topo da página e mudanças relevantes são comunicadas com
          antecedência. Aplica-se a legislação brasileira, eleito o foro do
          domicílio do usuário para dirimir controvérsias, quando cabível.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
