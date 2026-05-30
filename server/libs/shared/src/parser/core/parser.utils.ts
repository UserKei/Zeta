import { basename, extname } from 'node:path';

export const normalizeTextContent = (content: string | undefined) =>
  content
    ?.replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replaceAll('\0', '')
    .replace(/^\uFEFF/, '')
    .trim() ?? '';

export const normalizeFileName = (fileName: string | undefined) =>
  basename(fileName?.trim() || 'document');

export const getFileExtension = (fileName: string) =>
  extname(fileName).toLowerCase();

export const getDocumentNameFromFileName = (fileName: string) => {
  const normalizedFileName = normalizeFileName(fileName);
  const extension = extname(normalizedFileName);
  const documentName = extension
    ? normalizedFileName.slice(0, -extension.length).trim()
    : normalizedFileName.trim();

  return documentName || '文档';
};
