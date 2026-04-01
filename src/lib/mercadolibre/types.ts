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
  thumbnail?: string;
  condition?: string;
  variations?: Array<{
    id: number;
    available_quantity?: number;
  }>;
};

export type ItemMultigetEntry =
  | ItemBody
  | { code: number; body: ItemBody };
