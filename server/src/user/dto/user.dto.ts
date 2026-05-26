import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type { LoginPayload, RefreshTokenPayload } from '@zeta/common/user';

export class LoginDto implements LoginPayload {
  @ApiProperty({ example: 'admin', description: '登录用户名' })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ example: '123456', description: '登录密码' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshTokenDto implements RefreshTokenPayload {
  @ApiProperty({ description: 'Refresh Token' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
