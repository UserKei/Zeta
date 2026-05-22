import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { map, Observable } from 'rxjs';
import { ServiceResponse } from '../response/response.service';

type ResponseBody<T> = {
  code: number;
  data: T;
  message: string;
  path: string;
  success: true;
  timestamp: string;
};

const transformBigInt = (value: unknown): unknown => {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(transformBigInt);
  }

  if (value !== null && typeof value === 'object') {
    if (value instanceof Date) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        transformBigInt(entry),
      ]),
    );
  }

  return value;
};

const isServiceResponse = (
  value: unknown,
): value is ServiceResponse<unknown> => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  return 'data' in value && 'code' in value && 'message' in value;
};

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseBody<unknown>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseBody<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        const response = isServiceResponse(data)
          ? data
          : { data, code: 200, message: '请求成功' };

        return {
          timestamp: new Date().toISOString(),
          path: request.url,
          message: response.message,
          code: response.code,
          success: true,
          data: transformBigInt(response.data) ?? null,
        };
      }),
    );
  }
}
