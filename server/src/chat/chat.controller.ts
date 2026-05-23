import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthRequestUser } from '@libs/shared';
import type { ChatPayload } from '@zeta/common/chat';
import { ChatService } from './chat.service';

type AuthenticatedRequest = Request & {
  user: AuthRequestUser;
};

@UseGuards(AuthGuard)
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('agents/:agentId/chat')
  chat(
    @Param('agentId') agentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: ChatPayload,
  ) {
    return this.chatService.chat(agentId, request.user.id, body);
  }

  @Get('chat-sessions')
  listSessions(@Req() request: AuthenticatedRequest) {
    return this.chatService.listSessions(request.user.id);
  }

  @Get('chat-sessions/:id/messages')
  listMessages(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.chatService.listMessages(id, request.user.id);
  }
}
