import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@libs/shared';
import type {
  ChunkReorderPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import {
  KnowledgeDocsService,
  MARKDOWN_FILE_SIZE_LIMIT,
  type UploadedMarkdownFile,
} from './knowledge-docs.service';

type MarkdownImportRequestBody = {
  name?: string;
  description?: string;
  chunks?: string;
};

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

  @Post('knowledge-bases/:knowledgeBaseId/documents/markdown/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MARKDOWN_FILE_SIZE_LIMIT } }),
  )
  previewMarkdown(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFile() file?: UploadedMarkdownFile,
  ) {
    return this.knowledgeDocsService.previewMarkdownFile(knowledgeBaseId, file);
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/markdown')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MARKDOWN_FILE_SIZE_LIMIT } }),
  )
  createMarkdownDocument(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFile() file: UploadedMarkdownFile | undefined,
    @Body() body: MarkdownImportRequestBody,
  ) {
    return this.knowledgeDocsService.createMarkdownDocument(
      knowledgeBaseId,
      file,
      body,
    );
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
