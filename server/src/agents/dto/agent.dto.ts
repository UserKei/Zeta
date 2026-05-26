import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentStatus } from '@libs/shared/generated/prisma/enums';
import type { AgentPayload } from '@zeta/common/agents';

export class AgentDto implements AgentPayload {
  @ApiProperty({ example: 'IT 服务专家' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '回答员工 IT 服务相关问题' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '对话模型 ID' })
  @IsString()
  @MinLength(1)
  modelId!: string;

  @ApiProperty({ type: [String], description: '绑定知识库 ID 列表' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  knowledgeBaseIds!: string[];

  @ApiProperty({ example: '你是企业内部知识库问答专家。' })
  @IsString()
  @MinLength(1)
  systemPrompt!: string;

  @ApiPropertyOptional({ example: '你好，我可以回答 IT 服务相关问题。' })
  @IsOptional()
  @IsString()
  openingMessage?: string;

  @ApiProperty({ enum: AgentStatus, example: AgentStatus.PUBLISHED })
  @IsEnum(AgentStatus)
  status!: AgentStatus;

  @ApiPropertyOptional({ example: 0.7, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @ApiPropertyOptional({ example: 0.9, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number | null;
}

export class AgentUpdateDto implements Partial<AgentPayload> {
  @ApiPropertyOptional({ example: 'IT 服务专家' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: '回答员工 IT 服务相关问题' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '对话模型 ID' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  modelId?: string;

  @ApiPropertyOptional({ type: [String], description: '绑定知识库 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  knowledgeBaseIds?: string[];

  @ApiPropertyOptional({ example: '你是企业内部知识库问答专家。' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  systemPrompt?: string;

  @ApiPropertyOptional({ example: '你好，我可以回答 IT 服务相关问题。' })
  @IsOptional()
  @IsString()
  openingMessage?: string;

  @ApiPropertyOptional({ enum: AgentStatus, example: AgentStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @ApiPropertyOptional({ example: 0.7, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @ApiPropertyOptional({ example: 0.9, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number | null;
}
