import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import type {
  AuthTokenClaims,
  AuthTokenPayload,
  AuthUser,
} from '@zeta/common/user';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

const BCRYPT_ROUNDS = 10;

export const hashPassword = (password: string) => hash(password, BCRYPT_ROUNDS);

const parseInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessTtlSeconds = parseInteger(
      configService.get<string>('ACCESS_TOKEN_TTL_SECONDS'),
      15 * 60,
    );
    this.refreshTtlSeconds = parseInteger(
      configService.get<string>('REFRESH_TOKEN_TTL_SECONDS'),
      7 * 24 * 60 * 60,
    );
  }

  hashPassword(password: string) {
    return hashPassword(password);
  }

  verifyPassword(password: string, passwordHash: string) {
    return compare(password, passwordHash);
  }

  issueToken(user: AuthUser): TokenPair {
    return {
      accessToken: this.sign(user, 'access', this.accessTtlSeconds),
      refreshToken: this.sign(user, 'refresh', this.refreshTtlSeconds),
    };
  }

  verifyToken(token: string, tokenType: AuthTokenPayload['tokenType']) {
    let decoded: AuthTokenPayload;

    try {
      decoded = this.jwtService.verify<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('token is expired or invalid');
    }

    if (
      decoded.tokenType !== tokenType ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.username !== 'string'
    ) {
      throw new UnauthorizedException('token is expired or invalid');
    }

    return decoded;
  }

  private sign(
    user: AuthUser,
    tokenType: AuthTokenPayload['tokenType'],
    ttlSeconds: number,
  ) {
    const payload: AuthTokenClaims = {
      sub: user.id,
      username: user.username,
      tokenType,
    };

    return this.jwtService.sign(payload, { expiresIn: ttlSeconds });
  }
}
