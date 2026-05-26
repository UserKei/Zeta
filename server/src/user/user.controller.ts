import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequestUser } from '@libs/shared';
import { Request } from 'express';
import { UserService } from './user.service';
import { LoginDto, RefreshTokenDto } from './dto/user.dto';

type AuthenticatedRequest = Request & {
  user: AuthRequestUser;
};

@Controller('user')
@ApiTags('User')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.userService.login(body.username, body.password);
  }

  @Post('refresh-token')
  refreshToken(@Body() body: RefreshTokenDto) {
    return this.userService.refreshToken(body.refreshToken);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.userService.me(request.user.id);
  }
}
