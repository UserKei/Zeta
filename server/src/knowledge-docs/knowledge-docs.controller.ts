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
import type {
  ChunkPayload,
  ChunkUpdatePayload,
  MarkdownParsePayload,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import { KnowledgeDocsService } from './knowledge-docs.service';

@UseGuards(AuthGuard)
@Controller()
export class KnowledgeDocsController {
  constructor(private readonly knowledgeDocsService: KnowledgeDocsService) {}

  @Get('knowledge-bases/:knowledgeBaseId/documents')
  listByKnowledgeBase(@Param('knowledgeBaseId') knowledgeBaseId: string) {
    return this.knowledgeDocsService.listByKnowledgeBase(knowledgeBaseId);
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/manual')
  createManual(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Body() body: ManualDocumentPayload,
  ) {
    return this.knowledgeDocsService.createManual(knowledgeBaseId, body);
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/parse-markdown')
  parseMarkdown(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Body() body: MarkdownParsePayload,
  ) {
    return this.knowledgeDocsService.parseMarkdown(knowledgeBaseId, body);
  }

  @Post('knowledge-bases/:knowledgeBaseId/retrieval-test')
  retrievalTest(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Body() body: RetrievalTestPayload,
  ) {
    return this.knowledgeDocsService.retrievalTest(knowledgeBaseId, body);
  }

  @Get('documents/:id/chunks')
  listChunks(@Param('id') id: string) {
    return this.knowledgeDocsService.listChunks(id);
  }

  @Post('documents/:id/chunks')
  createChunk(@Param('id') id: string, @Body() body: ChunkPayload) {
    return this.knowledgeDocsService.createChunk(id, body);
  }

  @Patch('chunks/:id')
  updateChunk(@Param('id') id: string, @Body() body: ChunkUpdatePayload) {
    return this.knowledgeDocsService.updateChunk(id, body);
  }

  @Delete('chunks/:id')
  removeChunk(@Param('id') id: string) {
    return this.knowledgeDocsService.removeChunk(id);
  }

  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.knowledgeDocsService.remove(id);
  }
}
