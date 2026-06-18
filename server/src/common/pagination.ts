import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { PageQuery, PageResult } from '@zeta/common/pagination';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto implements PageQuery {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

export type NormalizedPagination = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export function normalizePagination(query?: PageQuery): NormalizedPagination {
  const page = Math.max(1, Math.floor(query?.page ?? DEFAULT_PAGE));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query?.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function toPageResult<T>(
  items: T[],
  total: number,
  pagination: Pick<NormalizedPagination, 'page' | 'pageSize'>,
): PageResult<T> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}
