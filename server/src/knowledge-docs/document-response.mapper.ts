import type { Prisma } from '@libs/shared/generated/prisma/client';
import { documentSelect } from './knowledge-docs.select';

export type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentSelect;
}>;

export type DocumentResponse = Omit<DocumentRecord, 'metadata'> & {
  description: string | null;
};

export function toDocumentResponse(document: DocumentRecord): DocumentResponse {
  const { metadata, ...documentData } = document;
  const metadataObject = toMetadataObject(metadata);

  return {
    ...documentData,
    description:
      typeof metadataObject.description === 'string'
        ? metadataObject.description
        : null,
  };
}

function toMetadataObject(metadata: Prisma.JsonValue) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, Prisma.JsonValue>;
  }

  return {};
}
