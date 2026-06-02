import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { HttpExceptionResponseFilter } from './http-exception.filter';

const createHost = () => {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const response = {
    status: jest.fn(),
    json,
  };
  response.status.mockReturnValue(response);

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/test' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, status: response.status, json };
};

describe('HttpExceptionResponseFilter', () => {
  it('keeps HttpException status and message', () => {
    const filter = new HttpExceptionResponseFilter();
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException('bad input'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test',
        message: 'bad input',
        code: 400,
        success: false,
      }),
    );
  });

  it('returns a generic response for non-http exceptions', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const filter = new HttpExceptionResponseFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error('database password leaked'), host);

    expect(logger).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test',
        message: '服务异常',
        code: 500,
        success: false,
      }),
    );
    expect(json).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'database password leaked',
      }),
    );
    const body = json.mock.calls[0]?.[0];
    expect(body).not.toHaveProperty('stack');
  });
});
