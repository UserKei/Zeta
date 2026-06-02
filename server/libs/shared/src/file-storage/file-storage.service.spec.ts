import { NotFoundException } from '@nestjs/common';

jest.mock('../generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { FileStorageService } from './file-storage.service';

describe('FileStorageService readBuffer', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new FileStorageService(prisma as never);

  it('reads a large object buffer with file metadata', async () => {
    const file = {
      id: 'file-1',
      fileName: '流程图.png',
      mimeType: 'image/png',
      fileSize: 12n,
      loid: 123n,
    };
    const content = Buffer.from('image-bytes');
    const prisma = {
      file: {
        findUnique: jest.fn().mockResolvedValue(file),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ content }]),
    };
    const service = createService(prisma);

    await expect(service.readBuffer('file-1')).resolves.toEqual({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      buffer: content,
    });
    expect(prisma.file.findUnique).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        loid: true,
      },
    });
  });

  it('throws not found when file metadata does not exist', async () => {
    const service = createService({
      file: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.readBuffer('missing-file')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws not found when large object content is missing', async () => {
    const service = createService({
      file: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file-1',
          fileName: '流程图.png',
          mimeType: 'image/png',
          fileSize: 12n,
          loid: 123n,
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });

    await expect(service.readBuffer('file-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('FileStorageService removeFilesIfUnreferenced', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new FileStorageService(prisma as never);

  it('keeps files referenced by document asset metadata', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 1 }]),
      file: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    const service = createService(prisma);

    await service.removeFilesIfUnreferenced(['asset-file-1']);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.file.findUnique).not.toHaveBeenCalled();
    expect(prisma.file.delete).not.toHaveBeenCalled();
  });

  it('deletes file metadata and unlinks the large object in one transaction', async () => {
    const tx = {
      file: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file-1',
          loid: 123n,
        }),
        delete: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const runTransaction = <T>(callback: (client: typeof tx) => T) =>
      callback(tx);
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
      $transaction: jest.fn(runTransaction),
    };
    const service = createService(prisma);

    await service.removeFilesIfUnreferenced(['file-1']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
