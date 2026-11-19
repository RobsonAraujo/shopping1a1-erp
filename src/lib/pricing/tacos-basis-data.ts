import { loadAdsMetricsByItem } from "@/lib/lucratividade/financial-evaluation-data";
import { siteIdFromItemId } from "@/lib/mercadolibre/listing-fees";
import { getProductAdsDateRange } from "@/lib/mercadolibre/product-ads-metrics";
import {
  TACOS_BASIS_DAYS,
  adsFromLoad,
  type TacosAds,
  type TacosBasis,
} from "@/lib/pricing/tacos-basis";

/**
 * O ADS de um anúncio agora, numa base (hoje ou 7 dias): uma consulta ao
 * Product Ads (+ o anunciante). Quem chama confere que o anúncio é da loja.
 */
export async function loadListingAds(
  token: string,
  mlItemId: string,
  basis: TacosBasis,
): Promise<TacosAds> {
  const range = getProductAdsDateRange(TACOS_BASIS_DAYS[basis]);
  const load = await loadAdsMetricsByItem(token, siteIdFromItemId(mlItemId), [mlItemId], range);
  return adsFromLoad(load, mlItemId, basis, range);
}
