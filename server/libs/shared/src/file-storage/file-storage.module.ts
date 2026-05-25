import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FileStorageService } from './file-storage.service';

@Module({
  imports: [PrismaModule],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}
