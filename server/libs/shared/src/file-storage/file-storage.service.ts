import { Injectable } from '@nestjs/common';
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

  async removeFileIfUnreferenced(fileId: string | null | undefined) {
    if (!fileId) {
      return;
    }

    await this.removeFilesIfUnreferenced([fileId]);
  }

  async removeFilesIfUnreferenced(fileIds: string[]) {
    for (const fileId of [...new Set(fileIds)]) {
      const referenceCount = await this.prisma.document.count({
        where: { sourceFileId: fileId },
      });

      if (referenceCount === 0) {
        await this.removeFile(fileId);
      }
    }
  }

  private async removeFile(fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, loid: true },
    });

    if (!file) {
      return;
    }

    await this.unlinkLargeObject(file.loid);
    await this.prisma.file.delete({ where: { id: file.id } });
  }

  private async unlinkLargeObject(loid: bigint) {
    await this.prisma.$queryRaw`SELECT lo_unlink(${loid}::oid)`;
  }
}
