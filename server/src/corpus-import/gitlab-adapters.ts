import { basename, extname } from 'node:path';

export type GitLabDocumentMetadata = {
  documentName: string;
  retrievalHints: string[];
};

export const resolveGitLabDocumentMetadata = (
  relativePath: string,
  rawContent: string,
): GitLabDocumentMetadata => {
  const frontmatter = parseGitLabFrontmatter(rawContent);
  const documentName = normalizeHint(frontmatter.title)?.slice(0, 120);

  return {
    documentName: documentName || getFallbackDocumentName(relativePath),
    retrievalHints: uniqueHints([
      relativePath,
      toPathHint(relativePath),
      frontmatter.description,
    ]),
  };
};

export const resolveGitLabDocumentName = (
  relativePath: string,
  rawContent: string,
) => {
  return resolveGitLabDocumentMetadata(relativePath, rawContent).documentName;
};

const getFallbackDocumentName = (relativePath: string) =>
  basename(relativePath, extname(relativePath))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

const parseGitLabFrontmatter = (rawContent: string) => {
  const content = rawContent.replace(/^\uFEFF/, '');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)?.[1];

  if (!frontmatter) {
    return {};
  }

  return {
    title: extractYamlString(frontmatter, 'title'),
    description: extractYamlString(frontmatter, 'description'),
  };
};

const extractYamlString = (frontmatter: string, key: string) => {
  const value = frontmatter.match(
    new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'),
  )?.[1];

  return value ? stripYamlStringQuotes(value.trim()) : null;
};

const stripYamlStringQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
};

const toPathHint = (relativePath: string) => {
  const pathWithoutExtension = relativePath
    .replace(/^content\//, '')
    .replace(/\.[^.]+$/, '');
  const parts = pathWithoutExtension
    .split('/')
    .filter((part) => part && part !== '_index' && part !== 'index')
    .flatMap((part) => part.split(/[-_]+/))
    .filter(Boolean);

  return parts.join(' ');
};

const uniqueHints = (values: Array<string | null | undefined>) => {
  const hints: string[] = [];

  for (const value of values) {
    const normalized = normalizeHint(value);

    if (normalized && !hints.includes(normalized)) {
      hints.push(normalized);
    }
  }

  return hints;
};

const normalizeHint = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  return normalized || null;
};
