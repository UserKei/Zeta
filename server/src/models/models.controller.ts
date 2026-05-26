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
import { ModelsService } from './models.service';
import { ModelDto, ModelUpdateDto } from './dto/model.dto';

@UseGuards(AuthGuard)
@Controller('models')
@ApiTags('Models')
@ApiBearerAuth('access-token')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  list() {
    return this.modelsService.list();
  }

  @Post()
  create(@Body() body: ModelDto) {
    return this.modelsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: ModelUpdateDto) {
    return this.modelsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.modelsService.remove(id);
  }
}
