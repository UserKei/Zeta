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
import { AgentsService } from './agents.service';
import { AgentDto, AgentUpdateDto } from './dto/agent.dto';

@UseGuards(AuthGuard)
@Controller('agents')
@ApiTags('Agents')
@ApiBearerAuth('access-token')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list() {
    return this.agentsService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.agentsService.get(id);
  }

  @Post()
  create(@Body() body: AgentDto) {
    return this.agentsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: AgentUpdateDto) {
    return this.agentsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.agentsService.remove(id);
  }
}
