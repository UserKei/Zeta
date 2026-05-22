import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from '@libs/shared';
import { AuthModule } from './auth/auth.module';
import { ModelsModule } from './models/models.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [SharedModule, AuthModule, UserModule, ModelsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
