import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@libs/shared';
import { DocumentStatus } from '@libs/shared/generated/prisma/enums';
import { ChunkIndexingService } from './chunk-indexing.service';
import type { EmbedDocumentJobData } from './document-processing.constants';
import {
  indexableKnowledgeBaseSelect,
  withIndexableEmbeddingModel,
} from './knowledge-base-model-resolver';

@Injectable()
export class DocumentEmbeddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkIndexingService: ChunkIndexingService,
  ) {}

  async processDocument(job: EmbedDocumentJobData) {
    const document = await this.prisma.document.findUnique({
      where: { id: job.documentId },
      select: {
        id: true,
        knowledgeBaseId: true,
        knowledgeBase: { select: indexableKnowledgeBaseSelect },
      },
    });

    if (!document) {
      throw new NotFoundException('embedding document does not exist');
    }

    try {
      if (document.knowledgeBaseId !== job.knowledgeBaseId) {
        throw new NotFoundException('embedding document does not exist');
      }

      const knowledgeBase = withIndexableEmbeddingModel(document.knowledgeBase);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });
      await this.chunkIndexingService.rebuildDocumentEmbeddings(
        document.id,
        knowledgeBase.embeddingModel,
      );
      await this.chunkIndexingService.refreshIndexedDocumentStats(document.id);
    } catch (cause) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            cause instanceof Error ? cause.message : 'embedding failed',
        },
      });

      throw cause;
    }
  }
}
