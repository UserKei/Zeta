import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FileStorageModule } from '@libs/shared';
import { DOCUMENT_PROCESSING_QUEUE } from '../knowledge-docs/document-processing.constants';
import { DocumentProcessingJobService } from '../knowledge-docs/document-processing-job.service';
import { KnowledgeBasesController } from './knowledge-bases.controller';
import { KnowledgeBasesService } from './knowledge-bases.service';

@Module({
  imports: [
    FileStorageModule,
    BullModule.registerQueue({
      name: DOCUMENT_PROCESSING_QUEUE,
    }),
  ],
  controllers: [KnowledgeBasesController],
  providers: [DocumentProcessingJobService, KnowledgeBasesService],
})
export class KnowledgeBasesModule {}
