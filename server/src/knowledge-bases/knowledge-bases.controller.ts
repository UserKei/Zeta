import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@libs/shared';
import { KnowledgeBasesService } from './knowledge-bases.service';
import {
  KnowledgeBaseDto,
  KnowledgeBaseUpdateDto,
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

  @Post()
  create(@Body() body: KnowledgeBaseDto) {
    return this.knowledgeBasesService.create(body);
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
