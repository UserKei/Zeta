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
import { AuthGuard } from '@libs/shared';
import type { AgentPayload } from '@zeta/common/agents';
import { AgentsService } from './agents.service';

@UseGuards(AuthGuard)
@Controller('agents')
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
  create(@Body() body: AgentPayload) {
    return this.agentsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<AgentPayload>) {
    return this.agentsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.agentsService.remove(id);
  }
}
