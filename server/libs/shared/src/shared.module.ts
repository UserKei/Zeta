import { Module, Global } from '@nestjs/common';
import { SharedService } from './shared.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ResponseModule } from './response/response.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth/auth.guard';
import { EmbeddingModule } from './embedding/embedding.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { ParserModule } from './parser/parser.module';
import { TextSplitterModule } from './text-splitter/text-splitter.module';
import { FileStorageModule } from './file-storage/file-storage.module';
import { getZetaEnvFilePath } from './env/load-env';

const envFilePath = getZetaEnvFilePath();

@Global()
@Module({
  providers: [SharedService, ConfigService, AuthGuard],
  exports: [
    SharedService,
    PrismaModule,
    ResponseModule,
    ConfigModule,
    JwtModule,
    EmbeddingModule,
    RetrievalModule,
    ParserModule,
    TextSplitterModule,
    FileStorageModule,
  ],
  imports: [
    PrismaModule,
    ResponseModule,
    EmbeddingModule,
    RetrievalModule,
    ParserModule,
    TextSplitterModule,
    FileStorageModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath ? [envFilePath] : [],
      ignoreEnvFile: !envFilePath,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('AUTH_TOKEN_SECRET'),
      }),
    }),
  ],
})
export class SharedModule {}
