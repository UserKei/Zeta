import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { RerankModule } from '../rerank/rerank.module';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [EmbeddingModule, RerankModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
