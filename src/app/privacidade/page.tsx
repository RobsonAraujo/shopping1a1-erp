import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMarketingCtaState } from "@/lib/mercadolibre/session";
import { siteUrl } from "@/lib/infra/site-url";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";
import { LEGAL } from "@/lib/marketing/legal";

const title = "Política de privacidade";
const description =
  "Quais dados o ERP 1a1 coleta da sua conta do Mercado Livre, por que os usa, onde ficam guardados e como pedir exclusão.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl()}/privacidade` },
  robots: { index: true, follow: true },
};

export default async function PrivacidadePage() {
  const cookieStore = await cookies();
  const { isLoggedIn, dashboardHref } = getMarketingCtaState(cookieStore);

  return (
    <LegalPage
      isLoggedIn={isLoggedIn}
      dashboardHref={dashboardHref}
      title="Política de privacidade"
      intro="Esta política explica quais dados o ERP 1a1 recebe quando você conecta sua conta do Mercado Livre, para que eles são usados e o que você pode pedir a qualquer momento."
    >
      <LegalSection n={1} title="Quem trata os seus dados">
        <p>
          O <strong>{LEGAL.productName}</strong> é operado por{" "}
          <strong>{LEGAL.legalName}</strong>, inscrita no CNPJ{" "}
          {LEGAL.cnpj}, com sede em {LEGAL.address}. Para qualquer assunto
          relacionado a esta política, incluindo pedidos previstos na Lei Geral
          de Proteção de Dados (LGPD, Lei 13.709/2018), escreva para{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Não pedimos e não guardamos a sua senha">
        <p>
          O acesso ao painel é feito pelo <strong>OAuth oficial do Mercado
          Livre</strong>. Você autentica no site do próprio Mercado Livre e
          autoriza o aplicativo; nós recebemos de volta um token de acesso.
        </p>
        <p>
          Em nenhum momento o ERP 1a1 tem contato com o seu usuário e senha do
          Mercado Livre. Os tokens recebidos são{" "}
          <strong>armazenados criptografados no servidor</strong> e usados
          apenas para as chamadas de API descritas abaixo. Você pode revogar a
          autorização a qualquer momento nas configurações da sua conta do
          Mercado Livre. A partir daí o painel deixa de conseguir sincronizar
          novos dados.
        </p>
        <p>
          A autorização é solicitada com os escopos{" "}
          <strong>offline_access, read e write</strong>. O escopo de escrita é
          necessário para operações que você dispara dentro do painel; não
          alteramos anúncios, preços ou estoque por iniciativa própria.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Quais dados coletamos">
        <p>Ao conectar sua loja, o painel sincroniza da API do Mercado Livre:</p>
        <ul>
          <li>
            <strong>Identificação do vendedor</strong>: id da conta ML, nome e
            e-mail (quando o Mercado Livre o disponibiliza).
          </li>
          <li>
            <strong>Anúncios e catálogo</strong>: títulos, SKU, preços, tipo de
            anúncio, estoque e situação de concorrência.
          </li>
          <li>
            <strong>Vendas e faturamento</strong>: pedidos, unidades, tarifas
            cobradas, descontos de tarifa, devoluções, fretes e valores da
            fatura do Mercado Livre.
          </li>
          <li>
            <strong>Publicidade</strong>: investimento em Product Ads, usado no
            cálculo de margem pós ADS.
          </li>
          <li>
            <strong>Operações Full</strong>: envios, coletas e custos
            associados.
          </li>
        </ul>
        <p>
          Além disso, guardamos o que <strong>você cadastra</strong> no painel e
          o Mercado Livre não tem como fornecer: custo de nota por produto,
          substituição tributária, regime tributário e alíquotas, fornecedores,
          custos fixos, estoque de armazém e configurações do kanban.
        </p>
        <p>
          Registramos ainda dados técnicos mínimos de operação (registros de
          acesso e erros da aplicação) para manter o serviço no ar e
          investigar falhas.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Por que usamos esses dados">
        <p>
          Os dados são usados exclusivamente para{" "}
          <strong>prestar o serviço contratado por você</strong>: calcular
          margem por anúncio, apurar carga tributária, montar o DRE do mês,
          alimentar o kanban de compras e Full e gerar os relatórios do painel.
        </p>
        <p>
          <strong>Não vendemos seus dados.</strong> Não compartilhamos
          informações da sua loja com outros vendedores, não usamos seus números
          para alimentar rankings públicos e não fazemos publicidade
          comportamental com eles.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Isolamento entre lojas">
        <p>
          Cada conta do Mercado Livre conectada dá origem a uma{" "}
          <strong>organização isolada</strong>. Toda consulta de dados de
          negócio é filtrada pela organização do usuário autenticado, e o
          sistema possui uma trava em tempo de execução que recusa consultas em
          lote sem esse filtro.
        </p>
        <p>
          Na prática: uma loja não consegue enxergar produtos, vendas, custos ou
          apurações de outra.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Com quem compartilhamos">
        <p>
          Utilizamos prestadores de serviço que atuam como operadores, apenas na
          medida necessária para o funcionamento do produto:
        </p>
        <ul>
          <li>
            <strong>Mercado Livre</strong>: origem dos dados e autenticação.
          </li>
          <li>
            <strong>Hospedagem e banco de dados</strong>: infraestrutura em
            nuvem onde a aplicação e os dados residem.
          </li>
          <li>
            <strong>Monitoramento de erros</strong>: captura de falhas da
            aplicação para diagnóstico técnico.
          </li>
        </ul>
        <p>
          Também podemos divulgar dados quando houver{" "}
          <strong>obrigação legal ou ordem de autoridade competente</strong>.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Por quanto tempo guardamos">
        <p>
          Os dados ficam armazenados enquanto sua organização estiver ativa, já
          que o histórico é o que permite comparar meses e fechar o DRE do
          período.
        </p>
        <p>
          Ao pedir o encerramento, excluímos os dados da sua organização,
          ressalvadas as informações que precisemos reter por obrigação legal ou
          para exercício regular de direitos.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Seus direitos">
        <p>
          Conforme a LGPD, você pode solicitar confirmação de tratamento, acesso
          aos dados, correção de informações incompletas ou desatualizadas,
          portabilidade, anonimização, bloqueio, eliminação e informações sobre
          compartilhamento.
        </p>
        <p>
          Para exercer qualquer um desses direitos, escreva para{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
          Respondemos no prazo legal. Dois caminhos independentes já estão
          sempre à sua disposição: revogar a autorização do aplicativo dentro da
          sua conta do Mercado Livre e pedir a exclusão da organização.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Segurança">
        <p>
          Tokens de acesso são criptografados em repouso, o tráfego é servido
          sobre HTTPS e o acesso aos dados depende de sessão autenticada e
          vinculada à organização.
        </p>
        <p>
          Nenhum sistema é imune a incidentes. Se ocorrer um incidente de
          segurança relevante que possa acarretar risco ou dano a você,
          comunicaremos conforme a legislação aplicável.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Alterações nesta política">
        <p>
          Podemos atualizar este documento para refletir mudanças no produto ou
          na legislação. A data de última atualização fica no topo da página, e
          mudanças relevantes são avisadas por e-mail ou dentro do painel.
        </p>
        <p>
          Veja também os{" "}
          <Link href="/termos">Termos de uso</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
