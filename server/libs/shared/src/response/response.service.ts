import { Injectable } from '@nestjs/common';

export type ServiceResponse<T> = {
  code: number;
  data: T;
  message: string;
};

const businessResponse = {
  success: {
    code: 200,
    message: 'success',
  },
  error: {
    code: 500,
    message: 'error',
  },
};

@Injectable()
export class ResponseService {
  success<T>(data: T): ServiceResponse<T> {
    return {
      data,
      code: businessResponse.success.code,
      message: businessResponse.success.message,
    };
  }

  error<T>(
    data: T | null = null,
    message: string,
    code: number = businessResponse.error.code,
  ): ServiceResponse<T | null> {
    return {
      data,
      code,
      message: message || businessResponse.error.message,
    };
  }
}
