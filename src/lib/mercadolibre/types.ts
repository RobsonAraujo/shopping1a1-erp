export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  user_id?: number;
};

export type UserMe = {
  id: number;
  nickname: string;
  email?: string;
  country_id?: string;
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
  title: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  sold_quantity: number;
  status: string;
  permalink: string;
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
  }>;
};

export type ItemMultigetEntry =
  | ItemBody
  | { code: number; body: ItemBody };

export type OrderSearchOrderItem = {
  quantity?: number;
  item?: { id?: string };
  /** Em algumas respostas o id do anúncio vem no nível da linha */
  item_id?: string;
};

export type OrderSearchOrder = {
  /** Ex.: `paid`, `cancelled` — usamos para excluir cancelados na soma de vendas */
  status?: string;
  order_items?: OrderSearchOrderItem[];
};

export type OrderSearchResponse = {
  results: OrderSearchOrder[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
};
