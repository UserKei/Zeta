import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FileStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SaveFileInput = {
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
  metadata?: Prisma.InputJsonValue;
};

type StoredFileBuffer = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: bigint;
  buffer: Buffer;
};

type FileStorageDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class FileStorageService {
  constructor(private readonly prisma: PrismaService) {}

  async saveBuffer(input: SaveFileInput) {
    const [largeObject] = await this.prisma.$queryRaw<Array<{ loid: bigint }>>`
      SELECT lo_from_bytea(0, ${input.buffer})::bigint AS "loid"
    `;

    if (!largeObject) {
      throw new Error('failed to create large object');
    }

    try {
      return await this.prisma.file.create({
        data: {
          fileName: input.fileName,
          mimeType: input.mimeType || null,
          fileSize: BigInt(input.buffer.byteLength),
          sha256Hash: createHash('sha256').update(input.buffer).digest('hex'),
          loid: largeObject.loid,
          status: FileStatus.AVAILABLE,
          metadata: input.metadata ?? {},
        },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          sha256Hash: true,
          loid: true,
        },
      });
    } catch (cause) {
      await this.unlinkLargeObject(largeObject.loid);
      throw cause;
    }
  }

  async readBuffer(fileId: string): Promise<StoredFileBuffer> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        loid: true,
      },
    });

    if (!file) {
      throw new NotFoundException('file does not exist');
    }

    const [largeObject] = await this.prisma.$queryRaw<
      Array<{ content: Buffer | Uint8Array }>
    >`
      SELECT lo_get(${file.loid}::oid) AS "content"
    `;

    if (!largeObject) {
      throw new NotFoundException('file content does not exist');
    }

    return {
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      buffer: Buffer.from(largeObject.content),
    };
  }

  async removeFileIfUnreferenced(fileId: string | null | undefined) {
    if (!fileId) {
      return;
    }

    await this.removeFilesIfUnreferenced([fileId]);
  }

  async removeFilesIfUnreferenced(fileIds: string[]) {
    for (const fileId of [...new Set(fileIds)]) {
      const referenceCount = await this.countFileReferences(fileId);

      if (referenceCount === 0) {
        await this.removeFile(fileId);
      }
    }
  }

  private async countFileReferences(fileId: string) {
    const assetReference = JSON.stringify({
      assets: [{ fileId }],
    });
    const [result] = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "documents"
      WHERE "source_file_id" = ${fileId}::uuid
        OR "metadata" @> ${assetReference}::jsonb
    `;

    return result?.count ?? 0;
  }

  private async removeFile(fileId: string) {
    await this.prisma.$transaction(async (tx) => {
      const file = await tx.file.findUnique({
        where: { id: fileId },
        select: { id: true, loid: true },
      });

      if (!file) {
        return;
      }

      await tx.file.delete({ where: { id: file.id } });
      await this.unlinkLargeObject(file.loid, tx);
    });
  }

  private async unlinkLargeObject(
    loid: bigint,
    db: FileStorageDbClient = this.prisma,
  ) {
    await db.$queryRaw`SELECT lo_unlink(${loid}::oid)`;
  }
}
