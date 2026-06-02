import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@libs/shared';
import { KnowledgeDocsService } from './knowledge-docs.service';
import {
  DOCUMENT_FILE_COUNT_LIMIT,
  DOCUMENT_FILE_SIZE_LIMIT,
  MARKDOWN_FILE_SIZE_LIMIT,
} from './knowledge-docs.constants';
import {
  DocumentImportService,
  type UploadedDocumentFile,
} from './document-import.service';
import {
  ChunkDto,
  ChunkReorderDto,
  ChunkUpdateDto,
  DocumentUpdateDto,
  FileImportFormDto,
  ManualDocumentDto,
  MarkdownImportFormDto,
  RetrievalTestDto,
} from './dto/knowledge-docs.dto';

const DOCUMENT_FILE_DESCRIPTION =
  '.md/.markdown/.txt/.html/.htm/.pdf/.docx/.csv/.xlsx/.xls 文件，最多 10 个，单文件最大 2MB';

@UseGuards(AuthGuard)
@Controller()
@ApiTags('Knowledge Documents')
@ApiBearerAuth('access-token')
export class KnowledgeDocsController {
  constructor(
    private readonly knowledgeDocsService: KnowledgeDocsService,
    private readonly documentImportService: DocumentImportService,
  ) {}

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
    @UploadedFile() file?: UploadedDocumentFile,
  ) {
    return this.documentImportService.previewMarkdownFile(
      knowledgeBaseId,
      file,
    );
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/files/preview')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: DOCUMENT_FILE_DESCRIPTION,
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', DOCUMENT_FILE_COUNT_LIMIT, {
      limits: { fileSize: DOCUMENT_FILE_SIZE_LIMIT },
    }),
  )
  previewFiles(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFiles() files?: UploadedDocumentFile[],
  ) {
    return this.documentImportService.previewDocumentFiles(
      knowledgeBaseId,
      files,
    );
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
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() body: MarkdownImportFormDto,
  ) {
    return this.documentImportService.createMarkdownDocument(
      knowledgeBaseId,
      file,
      body,
    );
  }

  @Post('knowledge-bases/:knowledgeBaseId/documents/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'documents'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: DOCUMENT_FILE_DESCRIPTION,
        },
        documents: {
          type: 'string',
          description: '用户确认后的文档 JSON 字符串',
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', DOCUMENT_FILE_COUNT_LIMIT, {
      limits: { fileSize: DOCUMENT_FILE_SIZE_LIMIT },
    }),
  )
  createFileDocuments(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFiles() files: UploadedDocumentFile[] | undefined,
    @Body() body: FileImportFormDto,
  ) {
    return this.documentImportService.createFileDocuments(
      knowledgeBaseId,
      files,
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
