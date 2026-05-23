import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@libs/shared';
import { KnowledgeBaseStatus } from '@libs/shared/generated/prisma/enums';
import { KnowledgeBasesService } from './knowledge-bases.service';

type KnowledgeBaseBody = {
  name?: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  embeddingModelId?: string;
  chunkSize?: number;
  chunkOverlap?: number;
};

@UseGuards(AuthGuard)
@Controller('knowledge-bases')
export class KnowledgeBasesController {
  constructor(private readonly knowledgeBasesService: KnowledgeBasesService) {}

  @Get()
  list() {
    return this.knowledgeBasesService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.knowledgeBasesService.get(id);
  }

  @Post()
  create(@Body() body: KnowledgeBaseBody) {
    return this.knowledgeBasesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: KnowledgeBaseBody) {
    return this.knowledgeBasesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledgeBasesService.remove(id);
  }
}
