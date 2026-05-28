import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard, AuthRequestUser } from '@libs/shared';
import type { ChatStreamEvent } from '@zeta/common/chat';
import { ChatService } from './chat.service';
import { ChatDto, ChatImproveDto } from './dto/chat.dto';

type AuthenticatedRequest = Request & {
  user: AuthRequestUser;
};

@UseGuards(AuthGuard)
@Controller()
@ApiTags('Chat')
@ApiBearerAuth('access-token')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('agents/:agentId/chat')
  chat(
    @Param('agentId') agentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: ChatDto,
  ) {
    return this.chatService.chat(agentId, request.user.id, body);
  }

  @Post('agents/:agentId/chat/stream')
  async chatStream(
    @Param('agentId') agentId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Body() body: ChatDto,
  ) {
    const abortController = new AbortController();

    request.on('close', () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    });

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    try {
      for await (const event of this.chatService.streamChat(
        agentId,
        request.user.id,
        body,
        abortController.signal,
      )) {
        this.writeSseEvent(response, event);
      }
    } catch (cause) {
      if (!response.destroyed && !abortController.signal.aborted) {
        this.writeSseEvent(response, {
          type: 'error',
          message: cause instanceof Error ? cause.message : '流式问答失败',
        });
      }
    } finally {
      if (!response.destroyed) {
        response.end();
      }
    }
  }

  @Post('chat-messages/:messageId/improve')
  improveMessage(
    @Param('messageId') messageId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: ChatImproveDto,
  ) {
    return this.chatService.improveMessage(messageId, request.user.id, body);
  }

  @Get('chat-messages/:messageId/improve')
  listImproveRecords(
    @Param('messageId') messageId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.listImproveRecords(messageId, request.user.id);
  }

  @Delete('chat-messages/:messageId/improve/:chunkId')
  removeImproveRecord(
    @Param('messageId') messageId: string,
    @Param('chunkId') chunkId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chatService.removeImproveRecord(
      messageId,
      request.user.id,
      chunkId,
    );
  }

  @Get('chat-sessions')
  listSessions(@Req() request: AuthenticatedRequest) {
    return this.chatService.listSessions(request.user.id);
  }

  @Get('chat-sessions/:id/messages')
  listMessages(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.chatService.listMessages(id, request.user.id);
  }

  private writeSseEvent(response: Response, event: ChatStreamEvent) {
    if (response.destroyed) {
      return;
    }

    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
