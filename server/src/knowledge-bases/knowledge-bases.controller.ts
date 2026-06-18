import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@libs/shared';
import { KnowledgeBasesService } from './knowledge-bases.service';
import {
  KnowledgeBaseDto,
  KnowledgeBaseUpdateDto,
  KnowledgeUsageQueryDto,
} from './dto/knowledge-base.dto';

@UseGuards(AuthGuard)
@Controller('knowledge-bases')
@ApiTags('Knowledge Bases')
@ApiBearerAuth('access-token')
export class KnowledgeBasesController {
  constructor(private readonly knowledgeBasesService: KnowledgeBasesService) {}

  @Get()
  list() {
    return this.knowledgeBasesService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.knowledgeBasesService.get(id);
  }

  @Get(':id/usage')
  getUsage(@Param('id') id: string, @Query() query: KnowledgeUsageQueryDto) {
    return this.knowledgeBasesService.getUsage(id, query);
  }

  @Post()
  create(@Body() body: KnowledgeBaseDto) {
    return this.knowledgeBasesService.create(body);
  }

  @Post(':id/reindex')
  reindex(@Param('id') id: string) {
    return this.knowledgeBasesService.reindex(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: KnowledgeBaseUpdateDto) {
    return this.knowledgeBasesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledgeBasesService.remove(id);
  }
}
