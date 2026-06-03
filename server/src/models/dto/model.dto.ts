import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AiModelType } from '@libs/shared/generated/prisma/enums';
import type { ModelPayload, ModelUpdatePayload } from '@zeta/common/models';

export class ModelDto implements ModelPayload {
  @ApiProperty({ example: 'deepseek-chat', description: '模型配置名称' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'deepseek', description: '模型供应商' })
  @IsString()
  @MinLength(1)
  provider!: string;

  @ApiProperty({ enum: AiModelType, example: AiModelType.CHAT })
  @IsEnum(AiModelType)
  type!: AiModelType;

  @ApiProperty({ example: 'deepseek-v4-flash', description: '供应商模型名称' })
  @IsString()
  @MinLength(1)
  modelName!: string;

  @ApiProperty({
    example: 'https://api.deepseek.com',
    description: '供应商 API URL / OpenAI-compatible Base URL',
  })
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @ApiProperty({
    example: 'sk-***',
    description: '供应商 API Key，后端保存',
  })
  @IsString()
  @MinLength(1)
  apiKey!: string;

  @ApiPropertyOptional({ example: true, description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    example: { protocol: 'openai-compatible', dimensions: 1024 },
    nullable: true,
    description: '模型高级配置 JSON',
  })
  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown> | null;
}

export class ModelUpdateDto implements ModelUpdatePayload {
  @ApiPropertyOptional({ example: 'deepseek-chat' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'deepseek' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  provider?: string;

  @ApiPropertyOptional({ enum: AiModelType, example: AiModelType.CHAT })
  @IsOptional()
  @IsEnum(AiModelType)
  type?: AiModelType;

  @ApiPropertyOptional({ example: 'deepseek-v4-flash' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  modelName?: string;

  @ApiPropertyOptional({
    example: 'https://api.deepseek.com',
    nullable: true,
    description: '供应商 API URL / OpenAI-compatible Base URL',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string | null;

  @ApiPropertyOptional({
    example: 'sk-***',
    nullable: true,
    description: '供应商 API Key；编辑时不传表示保持原凭证',
  })
  @IsOptional()
  @IsString()
  apiKey?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    example: { protocol: 'dashscope-multimodal', dimension: 1024 },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown> | null;
}
