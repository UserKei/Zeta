import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeBaseStatus } from '@libs/shared/generated/prisma/enums';
import type {
  KnowledgeBasePayload,
  KnowledgeBaseUpdatePayload,
  KnowledgeUsageRange,
} from '@zeta/common/knowledge-bases';

export class KnowledgeBaseDto implements KnowledgeBasePayload {
  @ApiProperty({ example: 'IT 服务知识库', description: '知识库名称' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '员工 IT 支持流程', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    enum: KnowledgeBaseStatus,
    example: KnowledgeBaseStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(KnowledgeBaseStatus)
  status?: KnowledgeBaseStatus;

  @ApiProperty({ description: 'Embedding 模型 ID' })
  @IsString()
  @MinLength(1)
  embeddingModelId!: string;

  @ApiPropertyOptional({ example: 800, description: '默认分块长度' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chunkSize?: number;

  @ApiPropertyOptional({ example: 100, description: '默认分块重叠长度' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkOverlap?: number;
}

export class KnowledgeBaseUpdateDto implements KnowledgeBaseUpdatePayload {
  @ApiPropertyOptional({ example: 'IT 服务知识库' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: '员工 IT 支持流程', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    enum: KnowledgeBaseStatus,
    example: KnowledgeBaseStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(KnowledgeBaseStatus)
  status?: KnowledgeBaseStatus;

  @ApiPropertyOptional({ description: 'Embedding 模型 ID' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  embeddingModelId?: string;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chunkSize?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkOverlap?: number;
}

export class KnowledgeUsageQueryDto {
  @ApiPropertyOptional({
    enum: ['7d', '30d', 'all'],
    default: '30d',
    description: '知识热度统计时间范围',
  })
  @IsOptional()
  @IsIn(['7d', '30d', 'all'])
  range?: KnowledgeUsageRange;
}
