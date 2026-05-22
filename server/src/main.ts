import { NestFactory } from '@nestjs/core';
import { HttpExceptionResponseFilter } from '@libs/shared/interceptor/http-exception.filter';
import { ResponseInterceptor } from '@libs/shared/interceptor/response.interceptor';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionResponseFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
