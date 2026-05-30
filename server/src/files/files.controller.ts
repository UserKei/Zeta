import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard, FileStorageService } from '@libs/shared';

@UseGuards(AuthGuard)
@Controller('files')
@ApiTags('Files')
@ApiBearerAuth('access-token')
export class FilesController {
  constructor(private readonly fileStorageService: FileStorageService) {}

  @Get(':fileId')
  @ApiParam({ name: 'fileId', description: '文件 ID' })
  async read(@Param('fileId') fileId: string, @Res() response: Response) {
    const file = await this.fileStorageService.readBuffer(fileId);

    response.setHeader(
      'Content-Type',
      file.mimeType || 'application/octet-stream',
    );
    response.setHeader('Content-Length', String(file.buffer.byteLength));
    response.setHeader(
      'Content-Disposition',
      this.createInlineDisposition(file.fileName),
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.buffer);
  }

  private createInlineDisposition(fileName: string) {
    const fallback = fileName.replace(/["\\\r\n]|[^\x20-\x7E]/g, '_');
    const encoded = encodeURIComponent(fileName);

    return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
  }
}
