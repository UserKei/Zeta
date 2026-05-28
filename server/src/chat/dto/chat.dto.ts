import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChatImprovePayload, ChatPayload } from '@zeta/common/chat';

export class ChatDto implements ChatPayload {
  @ApiProperty({ example: 'VPN 权限多久生效？' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ description: '已有会话 ID，不传则创建新会话' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  topK?: number;
}

export class ChatImproveDto implements ChatImprovePayload {
  @ApiProperty({ description: '要写入的目标知识库 ID' })
  @IsUUID()
  knowledgeBaseId!: string;

  @ApiPropertyOptional({
    description: '追加到指定文档；不传时自动使用“聊天补充知识”文档',
  })
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @ApiPropertyOptional({
    description: '自动创建 AI_EXTRACTED 文档时使用的名称',
    example: '聊天补充知识',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  documentName?: string;

  @ApiPropertyOptional({ example: 'VPN 权限生效时间' })
  @IsOptional()
  @IsString()
  title?: string | null;

  @ApiProperty({ example: 'VPN 权限审批通过后通常 15 分钟内生效。' })
  @IsString()
  @MinLength(1)
  content!: string;
}
