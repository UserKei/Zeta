export type PageQuery = {
  page?: number;
  pageSize?: number;
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
