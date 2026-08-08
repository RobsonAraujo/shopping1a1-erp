export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  user_id?: number;
};

export type SellerReputation = {
  level_id: string | null;
  power_seller_status: "platinum" | "gold" | "silver" | null;
  transactions?: {
    completed?: number;
    canceled?: number;
    ratings?: {
      positive?: number;
      negative?: number;
      neutral?: number;
    };
  };
};

export type UserMe = {
  id: number;
  nickname: string;
  email?: string;
  country_id?: string;
  permalink?: string;
  seller_reputation?: SellerReputation;
};

export type ItemsSearchResponse = {
  results: string[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
};

export type ItemBody = {
  id: string;
  /** Dono do anúncio (API `/items`); usado para validar sessão. */
  seller_id?: number;
  /** SKU do vendedor (quando preenchido no anúncio). */
  seller_custom_field?: string;
  title: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  sold_quantity: number;
  status: string;
  /**
   * Criação deste anúncio na conta do vendedor (ISO 8601, API `/items`).
   * Não é a data do produto no catálogo geral do ML (`/products`).
   */
  date_created?: string;
  /** Categoria do anúncio (ex.: MLB1051). */
  category_id?: string;
  /** Tipo de anúncio (ex.: gold_special = Clássico, gold_pro = Premium). */
  listing_type_id?: string;
  /** Inventário Full no ML (quando `shipping.logistic_type` é fulfillment). */
  inventory_id?: string;
  permalink: string;
  /** Dimensões para frete: "HxWxL,peso_g" quando exposto pela API. */
  dimensions?: string;
  shipping?: {
    free_shipping?: boolean;
    mode?: string;
    logistic_type?: string;
    dimensions?: string;
  };
  /** Catálogo compartilhado (ML) vs anúncio clássico do vendedor */
  catalog_listing?: boolean;
  /** Miniatura (baixa resolução); prefira `pictures` ou `bestItemImageUrl` */
  thumbnail?: string;
  secure_thumbnail?: string;
  /** Fotos do anúncio; `secure_url` costuma ser maior que `thumbnail` */
  pictures?: Array<{
    id?: string;
    secure_url?: string;
    url?: string;
    size?: string;
    max_size?: string;
  }>;
  condition?: string;
  variations?: Array<{
    id: number;
    available_quantity?: number;
    inventory_id?: string;
    attribute_combinations?: Array<{
      name?: string;
      value_name?: string;
    }>;
  }>;
  /** Atributos do anúncio (alguns fluxos expõem o SKU aqui como `SELLER_SKU`). */
  attributes?: Array<{
    id?: string;
    value_name?: string;
    value_id?: string;
  }>;
  /** Ex.: inclui `"bundle"` quando o anúncio é um kit formado a partir de outros SKUs. */
  tags?: string[];
};

export type ItemMultigetEntry =
  | ItemBody
  | { code: number; body: ItemBody };

export type OrderSearchOrderItem = {
  quantity?: number;
  unit_price?: number;
  currency_id?: string;
  sale_fee?: number;
  item?: {
    id?: string;
    seller_sku?: string;
    seller_custom_field?: string;
  };
  seller_custom_field?: string;
  /** Em algumas respostas o id do anúncio vem no nível da linha */
  item_id?: string;
};

export type ItemRevenueByMonth = {
  lastMonth: number;
  currentMonth: number;
};

export type OrderSearchOrder = {
  id?: number | string;
  /** Ex.: `paid`, `cancelled` — usamos para excluir cancelados na soma de vendas */
  status?: string;
  date_closed?: string;
  date_created?: string;
  order_items?: OrderSearchOrderItem[];
  shipping?: { id?: number };
};

export type OrderSearchResponse = {
  results: OrderSearchOrder[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
};

export type CategoryPathSegment = {
  id: string;
  name: string;
};

export type CategoryBody = {
  id: string;
  name: string;
  path_from_root?: CategoryPathSegment[];
};

export type ItemPriceToWinResponse = {
  status?: string;
  // Doc fields can vary by category/site; keep flexible for raw persistence.
  [key: string]: unknown;
};
