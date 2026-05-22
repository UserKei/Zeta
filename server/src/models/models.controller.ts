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
import { AiModelType } from '@libs/shared/generated/prisma/enums';
import { AuthGuard } from '@libs/shared';
import { ModelsService } from './models.service';

type ModelBody = {
  name?: string;
  provider?: string;
  type?: AiModelType;
  modelName?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  isEnabled?: boolean;
};

@UseGuards(AuthGuard)
@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  list() {
    return this.modelsService.list();
  }

  @Post()
  create(@Body() body: ModelBody) {
    return this.modelsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: ModelBody) {
    return this.modelsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.modelsService.remove(id);
  }
}
