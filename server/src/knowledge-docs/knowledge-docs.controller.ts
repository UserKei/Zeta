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
  ChunkReorderPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
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
    // 临时预解析入口；后续会替换为 .md 文件上传预览。
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

  @Get('documents/:id')
  getDocument(@Param('id') id: string) {
    return this.knowledgeDocsService.getDocument(id);
  }

  @Patch('documents/:id')
  updateDocument(@Param('id') id: string, @Body() body: DocumentUpdatePayload) {
    return this.knowledgeDocsService.updateDocument(id, body);
  }

  @Post('documents/:id/chunks')
  createChunk(@Param('id') id: string, @Body() body: ChunkPayload) {
    return this.knowledgeDocsService.createChunk(id, body);
  }

  @Patch('documents/:id/chunks/reorder')
  reorderChunks(@Param('id') id: string, @Body() body: ChunkReorderPayload) {
    return this.knowledgeDocsService.reorderChunks(id, body);
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
