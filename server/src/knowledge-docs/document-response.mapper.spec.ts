import {
  DocumentSourceType,
  DocumentStatus,
} from '@libs/shared/generated/prisma/enums';
import { toDocumentResponse } from './document-response.mapper';

describe('toDocumentResponse', () => {
  const baseDocument = {
    id: 'doc-1',
    knowledgeBaseId: 'kb-1',
    sourceFileId: null,
    name: '员工入职流程',
    sourceType: DocumentSourceType.MANUAL,
    status: DocumentStatus.INDEXED,
    charCount: 12,
    chunkCount: 1,
    errorMessage: null,
    createdAt: new Date('2026-06-04T00:00:00.000Z'),
    updatedAt: new Date('2026-06-04T00:00:00.000Z'),
  };

  it('maps metadata description onto the document response', () => {
    expect(
      toDocumentResponse({
        ...baseDocument,
        metadata: { description: '适用于正式员工和实习生' },
      }),
    ).toEqual({
      ...baseDocument,
      description: '适用于正式员工和实习生',
    });
  });

  it('uses null description when metadata has no string description', () => {
    expect(
      toDocumentResponse({
        ...baseDocument,
        metadata: { description: 123 },
      }),
    ).toEqual({
      ...baseDocument,
      description: null,
    });
  });
});
