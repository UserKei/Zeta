import { Module, Global } from '@nestjs/common';
import { SharedService } from './shared.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ResponseModule } from './response/response.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth/auth.guard';

@Global()
@Module({
  providers: [SharedService, ConfigService, AuthGuard],
  exports: [
    SharedService,
    PrismaModule,
    ResponseModule,
    ConfigModule,
    JwtModule,
  ],
  imports: [
    PrismaModule,
    ResponseModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
