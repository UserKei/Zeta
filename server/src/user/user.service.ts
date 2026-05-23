import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@libs/shared';
import type { AuthTokenPayload, AuthUser } from '@zeta/common/user';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async login(username: string, password: string) {
    if (!username?.trim() || !password) {
      throw new BadRequestException('username and password are required');
    }

    const user = await this.prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (
      !user ||
      !(await this.authService.verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('username or password is incorrect');
    }

    const authUser = this.toAuthUser(user);

    return {
      user: authUser,
      token: this.authService.issueToken(authUser),
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException('refresh token is required');
    }

    const payload = this.authService.verifyToken(refreshToken, 'refresh');
    const user = await this.findUser(payload);

    return this.authService.issueToken(this.toAuthUser(user));
  }

  async me(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('user does not exist');
    }

    return user;
  }

  private async findUser(payload: AuthTokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('user does not exist');
    }

    return user;
  }

  private toAuthUser(user: {
    id: string;
    username: string;
    displayName: string | null;
  }): AuthUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    };
  }
}
