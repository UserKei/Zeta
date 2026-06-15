import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from '@libs/shared';
import { AuthModule } from './auth/auth.module';
import { ModelsModule } from './models/models.module';
import { UserModule } from './user/user.module';
import { KnowledgeBasesModule } from './knowledge-bases/knowledge-bases.module';
import { KnowledgeDocsModule } from './knowledge-docs/knowledge-docs.module';
import { AgentsModule } from './agents/agents.module';
import { ChatModule } from './chat/chat.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    SharedModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: Number(configService.get<string>('REDIS_PORT') || 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    AuthModule,
    UserModule,
    ModelsModule,
    KnowledgeBasesModule,
    KnowledgeDocsModule,
    AgentsModule,
    ChatModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
