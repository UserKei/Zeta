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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@libs/shared';
import {
  KnowledgeDocsService,
  MARKDOWN_FILE_SIZE_LIMIT,
  type UploadedMarkdownFile,
} from './knowledge-docs.service';
import {
  ChunkDto,
  ChunkReorderDto,
  ChunkUpdateDto,
  DocumentUpdateDto,
  ManualDocumentDto,
  MarkdownImportFormDto,
  RetrievalTestDto,
} from './dto/knowledge-docs.dto';

@UseGuards(AuthGuard)
@Controller()
@ApiTags('Knowledge Documents')
@ApiBearerAuth('access-token')
export class KnowledgeDocsController {
  constructor(private readonly knowledgeDocsService: KnowledgeDocsService) {}

  @Get('knowledge-bases/:knowledgeBaseId/documents')
  listByKnowledgeBase(@Param('knowledgeBaseId') knowledgeBaseId: string) {
    return this.knowledgeDocsService.listByKnowledgeBase(knowledgeBaseId);
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/manual')
  createManual(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Body() body: ManualDocumentDto,
  ) {
    return this.knowledgeDocsService.createManual(knowledgeBaseId, body);
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/markdown/preview')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '.md/.markdown 文件，最大 2MB',
        },
      },
    },
  })
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
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '.md/.markdown 文件，最大 2MB',
        },
        name: {
          type: 'string',
          description: '文档名称，不传则使用文件名',
        },
        description: {
          type: 'string',
          description: '文档说明',
        },
        chunks: {
          type: 'string',
          description: '用户确认后的分段 JSON 字符串',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MARKDOWN_FILE_SIZE_LIMIT } }),
  )
  createMarkdownDocument(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFile() file: UploadedMarkdownFile | undefined,
    @Body() body: MarkdownImportFormDto,
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
    @Body() body: RetrievalTestDto,
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
  updateDocument(@Param('id') id: string, @Body() body: DocumentUpdateDto) {
    return this.knowledgeDocsService.updateDocument(id, body);
  }

  @Post('documents/:id/chunks')
  createChunk(@Param('id') id: string, @Body() body: ChunkDto) {
    return this.knowledgeDocsService.createChunk(id, body);
  }

  @Patch('documents/:id/chunks/reorder')
  reorderChunks(@Param('id') id: string, @Body() body: ChunkReorderDto) {
    return this.knowledgeDocsService.reorderChunks(id, body);
  }

  @Patch('chunks/:id')
  updateChunk(@Param('id') id: string, @Body() body: ChunkUpdateDto) {
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
