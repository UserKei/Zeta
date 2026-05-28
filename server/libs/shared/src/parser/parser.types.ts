import type {
  ChunkDraftPayload,
  FileSourceFormat,
} from '@zeta/common/knowledge-docs';

export type MarkdownParseOptions = {
  maxChunkLength: number;
  maxChunkCount: number;
};

export type FileParseInput = {
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
};

export type FileParseOptions = {
  maxChunkLength: number;
  maxChunkCount: number;
};

export type FileParseResult = {
  fileName: string;
  documentName: string;
  sourceFormat: FileSourceFormat;
  chunks: ChunkDraftPayload[];
};

export interface DocumentFileParser {
  readonly sourceFormat: FileSourceFormat;
  supports(fileName: string, mimeType?: string | null): boolean;
  parse(input: FileParseInput, options: FileParseOptions): FileParseResult;
}

export const DEFAULT_FILE_PARSE_OPTIONS: FileParseOptions = {
  maxChunkLength: 102_400,
  maxChunkCount: 200,
};
