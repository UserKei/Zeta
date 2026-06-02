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
import { AiModelType } from '@libs/shared/generated/prisma/enums';
import { ModelsService } from './models.service';
import { ModelDto, ModelUpdateDto } from './dto/model.dto';

@UseGuards(AuthGuard)
@Controller('models')
@ApiTags('Models')
@ApiBearerAuth('access-token')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get('catalog/providers')
  listCatalogProviders() {
    return this.modelsService.listCatalogProviders();
  }

  @Get('catalog/types')
  listCatalogTypes(@Query('provider') provider: string) {
    return this.modelsService.listCatalogTypes(provider);
  }

  @Get('catalog/models')
  listCatalogModels(
    @Query('provider') provider: string,
    @Query('type') type: AiModelType,
  ) {
    return this.modelsService.listCatalogModels(provider, type);
  }

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
