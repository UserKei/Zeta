import { BadRequestException } from '@nestjs/common';
import { ChunkStatus } from '@libs/shared/generated/prisma/enums';
import {
  assertDocumentChunks,
  toChunkDrafts,
  toSingleChunkDraft,
} from './chunk-draft-normalizer';

describe('chunk draft normalizer', () => {
  it('normalizes chunk draft content, title, status, position, and metadata', () => {
    const [chunk] = toChunkDrafts([
      {
        title: '  标题  ',
        content: '  第一行\r\n第二行  ',
        status: ChunkStatus.DISABLED,
        metadata: { source: 'manual' },
      },
    ]);

    expect(chunk).toEqual(
      expect.objectContaining({
        title: '标题',
        content: '第一行\n第二行',
        status: ChunkStatus.DISABLED,
        position: 0,
        charCount: '第一行\n第二行'.length,
        metadata: { source: 'manual' },
      }),
    );
    expect(chunk.id).toHaveLength(36);
  });

  it('rejects missing chunk arrays', () => {
    expect(() => toChunkDrafts(undefined)).toThrow(BadRequestException);
  });

  it('rejects empty chunk content', () => {
    expect(() =>
      toSingleChunkDraft({ title: '空分段', content: '   ' }, 0),
    ).toThrow('chunk content is required');
  });

  it('requires at least one active chunk in a document', () => {
    const chunks = [
      toSingleChunkDraft(
        {
          content: '停用分段',
          status: ChunkStatus.DISABLED,
        },
        0,
      ),
    ];

    expect(() => assertDocumentChunks(chunks)).toThrow(
      'document must have active chunks',
    );
  });
});
