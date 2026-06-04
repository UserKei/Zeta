import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import type { CorpusPreset } from './corpus-presets';
import { resolveGitLabDocumentMetadata } from './gitlab-adapters';

export type CorpusFileRef = {
  absolutePath: string;
  relativePath: string;
};

export type PreparedCorpusFile = CorpusFileRef & {
  documentName: string;
  content: string;
  contentSha256: string;
  retrievalHints: string[];
  size: number;
};

type CorpusDocumentMetadataInput = {
  relativePath: string;
  sourcePath: string;
  contentSha256: string;
  sourceRef: string | null;
  retrievalHints?: string[];
};

export const findMarkdownCorpusFiles = async (
  root: string,
  preset: CorpusPreset,
): Promise<CorpusFileRef[]> => {
  const files: CorpusFileRef[] = [];

  await walkCorpusDirectory(root, root, preset, files);

  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
};

export const loadMarkdownCorpusFile = async (
  file: CorpusFileRef,
  preset?: CorpusPreset,
): Promise<PreparedCorpusFile | null> => {
  const rawContent = await readFile(file.absolutePath, 'utf8');
  const prepared = prepareMarkdownCorpusFile(
    file.relativePath,
    rawContent,
    preset,
  );

  if (!prepared.content) {
    return null;
  }

  return {
    ...file,
    ...prepared,
    size: Buffer.byteLength(prepared.content),
  };
};

export const prepareMarkdownCorpusFile = (
  relativePath: string,
  rawContent: string,
  preset?: CorpusPreset,
) => {
  const content = normalizeMarkdownCorpusContent(rawContent);
  const metadata =
    preset?.key === 'gitlab-handbook'
      ? resolveGitLabDocumentMetadata(relativePath, rawContent)
      : {
          documentName: getDocumentName(relativePath, content),
          retrievalHints: [],
        };

  return {
    documentName: metadata.documentName,
    content,
    contentSha256: sha256(content),
    retrievalHints: metadata.retrievalHints,
  };
};

export const buildCorpusDocumentMetadata = (
  preset: CorpusPreset,
  input: CorpusDocumentMetadataInput,
) => ({
  source: preset.source,
  importKey: preset.key,
  repoUrl: preset.repoUrl,
  relativePath: input.relativePath,
  sourcePath: input.sourcePath,
  sourceRef: input.sourceRef,
  contentSha256: input.contentSha256,
  retrievalHints: input.retrievalHints ?? [],
});

export const uuidFromKey = (key: string) => {
  const hash = createHash('sha256').update(key).digest('hex');

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-');
};

export const buildCorpusResourceIds = (importKey: string) => ({
  agentId: uuidFromKey(`zeta:corpus:${importKey}:agent`),
  chatModelId: uuidFromKey(`zeta:corpus:${importKey}:chat-model`),
  embeddingModelId: uuidFromKey(`zeta:corpus:${importKey}:embedding-model`),
  knowledgeBaseId: uuidFromKey(`zeta:corpus:${importKey}:knowledge-base`),
  rerankerModelId: uuidFromKey(`zeta:corpus:${importKey}:reranker-model`),
});

const walkCorpusDirectory = async (
  root: string,
  currentDirectory: string,
  preset: CorpusPreset,
  files: CorpusFileRef[],
) => {
  const entries = await readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      if (!preset.ignoredDirectoryNames.includes(entry.name)) {
        await walkCorpusDirectory(root, absolutePath, preset, files);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = toPosixPath(relative(root, absolutePath));

    if (!isIncludedCorpusFile(relativePath, preset)) {
      continue;
    }

    files.push({ absolutePath, relativePath });
  }
};

const isIncludedCorpusFile = (relativePath: string, preset: CorpusPreset) => {
  const extension = extname(relativePath).toLowerCase();

  return (
    preset.fileExtensions.includes(extension) &&
    preset.includePrefixes.some((prefix) => relativePath.startsWith(prefix))
  );
};

const normalizeMarkdownCorpusContent = (rawContent: string) =>
  rawContent
    .replace(/^\uFEFF/, '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/\{\{<[\s\S]*?>\}\}/g, '')
    .replace(/\{\{%[\s\S]*?%\}\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const getDocumentName = (relativePath: string, content: string) => {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();

  if (heading) {
    return heading.replace(/\s+/g, ' ').slice(0, 120);
  }

  return basename(relativePath, extname(relativePath))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
};

const sha256 = (content: string) =>
  createHash('sha256').update(content).digest('hex');

const toPosixPath = (path: string) => path.split(sep).join('/');
