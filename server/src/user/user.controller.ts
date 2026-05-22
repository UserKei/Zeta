import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRequestUser } from '@libs/shared';
import { Request } from 'express';
import { UserService } from './user.service';

type AuthenticatedRequest = Request & {
  user: AuthRequestUser;
};

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  login(@Body() body: { username?: string; password?: string }) {
    return this.userService.login(body.username ?? '', body.password ?? '');
  }

  @Post('refresh-token')
  refreshToken(@Body() body: { refreshToken?: string }) {
    return this.userService.refreshToken(body.refreshToken ?? '');
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.userService.me(request.user.id);
  }
}
