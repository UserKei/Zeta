import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    SharedModule,
    AuthModule,
    UserModule,
    ModelsModule,
    KnowledgeBasesModule,
    KnowledgeDocsModule,
    AgentsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
