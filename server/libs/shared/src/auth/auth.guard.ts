import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthRequestUser, AuthTokenPayload } from '@zeta/common/user';

export type { AuthRequestUser } from '@zeta/common/user';

type AuthenticatedRequest = Request & {
  user?: AuthRequestUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('access token is required');
    }

    let payload: AuthTokenPayload;

    try {
      payload = this.jwtService.verify<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('token is expired or invalid');
    }

    if (
      payload.tokenType !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string'
    ) {
      throw new UnauthorizedException('token is expired or invalid');
    }

    request.user = {
      id: payload.sub,
      username: payload.username,
    };

    return true;
  }
}
