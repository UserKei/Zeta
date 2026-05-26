import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { HttpExceptionResponseFilter } from '@libs/shared/interceptor/http-exception.filter';
import { ResponseInterceptor } from '@libs/shared/interceptor/response.interceptor';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) =>
        new BadRequestException(
          errors.length ? '请求参数不正确' : '请求体不能为空',
        ),
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionResponseFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle('Zeta API')
    .setDescription('Zeta AI 知识库管理平台 API')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access Token',
      },
      'access-token',
    )
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);

  SwaggerModule.setup('openapi', app, openApiDocument, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: 'openapi.json',
  });
  app.use(
    '/reference',
    apiReference({
      content: openApiDocument,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
