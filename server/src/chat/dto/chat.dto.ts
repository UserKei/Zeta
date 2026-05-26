import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChatPayload } from '@zeta/common/chat';

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
