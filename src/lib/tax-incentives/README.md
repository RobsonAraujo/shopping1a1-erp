# Incentivo fiscal de ICMS por NCM

Cadastro, em Meus produtos, de um incentivo fiscal de ICMS para as **vendas internas**. Uma venda é interna quando a UF da empresa (`CompanyTaxSettings.originUf`) é a mesma do faturamento do comprador.

## Regra

Na empresa do Lucro Real, quando o NCM do produto tem incentivo cadastrado, a venda interna usa como ICMS de débito o **% final cadastrado, já com o incentivo** (ex.: 12%). Esse % entra no lugar da alíquota da tabela da UF (ex.: SP 18%) e substitui base + FCP.

O resto não muda:

| Situação | O que acontece |
|---|---|
| Crédito da compra | É o "ICMS da compra" do cadastro, como veio na nota, e continua integral. Não há estorno proporcional, por decisão do usuário. |
| Venda interestadual | 4%, 7% ou 12%, mais o DIFAL pela alíquota do destino. O incentivo não é lido. |
| Produto com ICMS-ST na compra | A venda interna continua com 0%. |
| Escopo | O incentivo vale para todo produto da organização com o NCM, menos os marcados `Product.icmsIncentiveExcluded` ("não se aplica"). |
| "Só contribuinte" (`appliesTo = contribuinte`) | O incentivo só vale para comprador contribuinte de ICMS (`isContribuinteIcms`). O consumidor final fica com a tabela. |
| Vigência (`validFrom`/`validTo`, opcional, inclusive) | Conta pelo dia da venda no fuso de São Paulo (`orderDateYmdFromOrder`). Venda sem data só pega regra sem datas. |

O PIS/COFINS se ajusta sozinho. Com "excluir ICMS da base" ligado, menos ICMS destacado significa uma base de PIS/COFINS maior.

**Exemplo.** Venda SP→SP de R$ 100, com compra de R$ 50 a 12%:
- O ICMS fica 12 − 6 = R$ 6 (antes, 18 − 6 = R$ 12).
- A base do PIS/COFINS sobe de 82 para 88.
- O imposto da venda vai de 14,95% para 9,51% (`service/__tests__/compute-report-incentive.test.ts`).

## Onde está

| Peça | Arquivo |
|---|---|
| Modelo | `IcmsIncentive` (`@@unique([organizationId, ncm])`, NCM com 8 dígitos) + `Product.icmsIncentiveExcluded` |
| NCM | `ncm.ts`: `normalizeNcm`/`formatNcm`. O produto guarda o NCM como foi digitado, e toda comparação passa por aqui. |
| Resolução (puro) | `resolve.ts`: `resolveIcmsIncentive` (NCM + exclusão + vigência) e `icmsIncentiveAppliesToBuyer` |
| Banco | `icms-incentive-data.ts`, com `organizationId` primeiro. `IcmsIncentive` está em `TENANT_SCOPED_MODELS`. |
| API | `GET/PUT /api/tax-incentives`, `DELETE /api/tax-incentives/[ncm]` (`requireOrganization`). A resposta vem de `icms-incentive-screen.ts`. |
| Motor | O índice é carregado na geração (`generate-monthly-report.ts`) e no recálculo (`recomputeTaxReportPayload`). Fica gravado na venda (`TransacaoVenda.incentivoIcms`) e é aplicado em `obterAliquotaIcmsSaidaInterna` (`tax-report/calculators/icms-difal.ts`). |
| Tela | `components/produtos/IcmsIncentiveField.tsx`: aviso abaixo do NCM, switch em Classificação fiscal e tela do incentivo com os outros produtos do NCM. Também o selo na tabela e a lista em Configurações fiscais (`IcmsIncentivesCard`). |

## Quando o número muda

Igual ao custo: o Tributário só muda depois de "Atualizar cálculo". O recálculo resolve o incentivo de novo com as regras de hoje e a vigência pelo dia da venda.

Depois disso, cada consumidor acompanha assim:
- Meus produtos, Lucratividade e Calculadora acompanham pelo `daily_totals`.
- O DRE acompanha o mês recalculado.
- Ações do dia muda no próximo refresh.

## Cuidados (alertas levados ao usuário)

- **Benefício de atacado.** Muitos benefícios de SP são só para fabricante ou atacadista e não valem para consumidor final (ex.: art. 34 do Anexo II do RICMS/SP, RC 34258/2026). Para esses, use "só contribuinte".
- **Entrada maior que a saída.** O crédito é integral por decisão do usuário. Quando o ICMS da compra é maior que o % do incentivo, a tela mostra uma dica: pela regra geral da redução de base (LC 87/96; STF, RE 635688), parte do crédito pode ter que ser estornada.
- **Nota com redução de base (CST 20).** O "ICMS da compra" a cadastrar é o efetivo (ICMS destacado ÷ valor do produto), não a alíquota cheia impressa.
- **Benefício por descrição e NCM.** O RICMS lista o benefício "por descrição e NCM", e um produto do mesmo NCM pode não ter direito. Para esse caso existe o "não se aplica".
- **Simples Nacional.** O motor não roda para o Simples, e SP não deixa o optante usar o Anexo II (art. 51). No Simples a tela esconde o incentivo.
- **Incentivos interestaduais** (crédito presumido de e-commerce de MG e ES) ficam fora.
