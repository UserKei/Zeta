import { Module } from '@nestjs/common';
import { EmbeddingModule, RerankModule } from '@libs/model-adapters';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [EmbeddingModule, RerankModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
