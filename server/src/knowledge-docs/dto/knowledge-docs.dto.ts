import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChunkStatus } from '@libs/shared/generated/prisma/enums';
import type {
  ChunkDraftPayload,
  ChunkPayload,
  ChunkReorderPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  FileImportDocumentPayload,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';

export class ChunkDraftDto implements ChunkDraftPayload {
  @ApiPropertyOptional({ example: 'VPN 权限申请' })
  @IsOptional()
  @IsString()
  title?: string | null;

  @ApiProperty({ example: 'VPN 权限审批通过后通常 15 分钟内生效。' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ enum: ChunkStatus, example: ChunkStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ChunkStatus)
  status?: ChunkStatus;
}

export class ManualDocumentDto implements ManualDocumentPayload {
  @ApiProperty({ example: '员工入职 IT 账号开通流程' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '手动维护的 IT 服务知识' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: [ChunkDraftDto],
    description: '用户确认后的分段列表；空数组表示快速创建空白文档',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChunkDraftDto)
  chunks!: ChunkDraftDto[];
}

export class MarkdownImportFormDto {
  @ApiPropertyOptional({ example: '知识库测试文档' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Markdown 文件导入' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: '用户确认后的分段 JSON 字符串',
    example:
      '[{"title":"VPN 权限申请","content":"VPN 权限审批通过后通常 15 分钟内生效。","status":"ACTIVE"}]',
  })
  @IsOptional()
  @IsString()
  chunks?: string;
}

export class FileImportFormDto {
  @ApiProperty({
    description: '用户确认后的文档 JSON 字符串',
    example:
      '[{"fileIndex":0,"name":"员工手册","chunks":[{"title":"员工手册","content":"正文内容","status":"ACTIVE"}]}]',
  })
  @IsString()
  @MinLength(1)
  documents!: string;
}

export class FileImportDocumentDto implements FileImportDocumentPayload {
  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileIndex!: number;

  @ApiProperty({ example: '员工手册' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '文本文件导入' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [ChunkDraftDto], description: '用户确认后的分段列表' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChunkDraftDto)
  chunks!: ChunkDraftDto[];
}

export class DocumentUpdateDto implements DocumentUpdatePayload {
  @ApiPropertyOptional({ example: '员工入职 IT 账号开通流程' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: '更新后的文档说明', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class ChunkDto implements ChunkPayload {
  @ApiPropertyOptional({ example: 'VPN 权限申请' })
  @IsOptional()
  @IsString()
  title?: string | null;

  @ApiProperty({ example: 'VPN 权限审批通过后通常 15 分钟内生效。' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ enum: ChunkStatus, example: ChunkStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ChunkStatus)
  status?: ChunkStatus;

  @ApiPropertyOptional({ nullable: true, description: '插入到指定分段之后' })
  @IsOptional()
  @IsString()
  afterChunkId?: string | null;
}

export class ChunkUpdateDto implements ChunkUpdatePayload {
  @ApiPropertyOptional({ example: 'VPN 权限申请' })
  @IsOptional()
  @IsString()
  title?: string | null;

  @ApiPropertyOptional({ example: 'VPN 权限审批通过后通常 15 分钟内生效。' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ enum: ChunkStatus, example: ChunkStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ChunkStatus)
  status?: ChunkStatus;
}

export class ChunkReorderDto implements ChunkReorderPayload {
  @ApiProperty({
    type: [String],
    description: '当前文档内全部分段 ID 的新顺序',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  chunkIds!: string[];
}

export class RetrievalTestDto implements RetrievalTestPayload {
  @ApiProperty({ example: 'VPN 权限多久生效？' })
  @IsString()
  @MinLength(1)
  question!: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  topK?: number;
}
