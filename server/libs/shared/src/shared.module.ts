import { Module, Global } from '@nestjs/common';
import { SharedService } from './shared.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ResponseModule } from './response/response.module';

@Global()
@Module({
  providers: [SharedService, ConfigService],
  exports: [SharedService, PrismaModule, ResponseModule, ConfigModule],
  imports: [
    PrismaModule,
    ResponseModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
  ],
})
export class SharedModule {}
