import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gitlabHandbookPreset } from '../../scripts/corpus-presets';
import {
  buildCorpusDocumentMetadata,
  buildCorpusResourceIds,
  findMarkdownCorpusFiles,
  prepareMarkdownCorpusFile,
  uuidFromKey,
} from './markdown-corpus.helpers';

describe('markdown corpus helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zeta-corpus-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('finds markdown files and skips ignored corpus paths', async () => {
    await mkdir(join(tempDir, 'content'), { recursive: true });
    await mkdir(join(tempDir, 'node_modules'), { recursive: true });
    await mkdir(join(tempDir, '.git'), { recursive: true });

    await writeFile(join(tempDir, 'README.md'), '# Root\n');
    await writeFile(join(tempDir, 'content.md'), '# Content\n');
    await writeFile(join(tempDir, 'notes.txt'), 'not markdown');
    await writeFile(join(tempDir, 'content.mdx'), '# MDX\n');
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(join(tempDir, 'static.md'), '# keep root static name\n');
    await writeFile(join(tempDir, 'skip.lock'), '');
    await writeFile(join(tempDir, 'content', 'handbook.md'), '# Handbook\n');
    await writeFile(join(tempDir, 'node_modules', 'ignored.md'), '# Ignored\n');

    await expect(
      findMarkdownCorpusFiles(tempDir, gitlabHandbookPreset),
    ).resolves.toEqual([
      {
        absolutePath: join(tempDir, 'content', 'handbook.md'),
        relativePath: 'content/handbook.md',
      },
    ]);
  });

  it('prepares markdown by removing frontmatter and Hugo shortcodes', () => {
    const prepared = prepareMarkdownCorpusFile(
      'content/handbook/values.md',
      `---
title: Values
---

{{< youtube id="demo" >}}

# Values

Be transparent.
      `,
    );

    expect(prepared.documentName).toBe('Values');
    expect(prepared.content).toContain('# Values');
    expect(prepared.content).toContain('Be transparent.');
    expect(prepared.content).not.toContain('title: Values');
    expect(prepared.content).not.toContain('youtube');
    expect(prepared.contentSha256).toHaveLength(64);
  });

  it('uses GitLab frontmatter title as document name', () => {
    const prepared = prepareMarkdownCorpusFile(
      'content/handbook/acquisitions/_index.md',
      `---
title: Acquisitions Handbook
description: "GitLab's acquisitions page."
extra_css:
  - direction.css
---

GitLab acquisition content.
      `,
      gitlabHandbookPreset,
    );

    expect(prepared.documentName).toBe('Acquisitions Handbook');
    expect(prepared.retrievalHints).toEqual(
      expect.arrayContaining([
        'content/handbook/acquisitions/_index.md',
        'handbook acquisitions',
        "GitLab's acquisitions page.",
      ]),
    );
    expect(prepared.content).toContain('GitLab acquisition content.');
    expect(prepared.content).not.toContain('title: Acquisitions Handbook');
  });

  it('does not use markdown headings for GitLab document names', () => {
    const prepared = prepareMarkdownCorpusFile(
      'content/job-description-library/board-of-directors/board_member.md',
      `---
title: Board Member
---

# Ignored Heading

Board member content.
      `,
      gitlabHandbookPreset,
    );

    expect(prepared.documentName).toBe('Board Member');
  });

  it('falls back to filename when GitLab frontmatter has no title', () => {
    const prepared = prepareMarkdownCorpusFile(
      'content/handbook/about/maintenance.md',
      `---
description: Maintenance page.
---

Maintenance content.
      `,
      gitlabHandbookPreset,
    );

    expect(prepared.documentName).toBe('maintenance');
  });

  it('builds stable import metadata for idempotency', () => {
    const metadata = buildCorpusDocumentMetadata(gitlabHandbookPreset, {
      relativePath: 'content/handbook/values.md',
      sourcePath: '/repo/content/handbook/values.md',
      contentSha256: 'a'.repeat(64),
      sourceRef: 'main',
      retrievalHints: [
        'content/handbook/values.md',
        'handbook values',
        'Company values page.',
      ],
    });

    expect(metadata).toEqual({
      source: 'GITLAB_HANDBOOK',
      importKey: 'gitlab-handbook',
      repoUrl: gitlabHandbookPreset.repoUrl,
      relativePath: 'content/handbook/values.md',
      sourcePath: '/repo/content/handbook/values.md',
      sourceRef: 'main',
      contentSha256: 'a'.repeat(64),
      retrievalHints: [
        'content/handbook/values.md',
        'handbook values',
        'Company values page.',
      ],
    });
  });

  it('creates deterministic UUIDs from import keys', () => {
    const first = uuidFromKey('zeta:corpus:gitlab-handbook:kb');
    const second = uuidFromKey('zeta:corpus:gitlab-handbook:kb');

    expect(first).toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('builds stable resource ids including reranker model id', () => {
    const ids = buildCorpusResourceIds('gitlab-handbook');

    expect(ids).toEqual({
      agentId: uuidFromKey('zeta:corpus:gitlab-handbook:agent'),
      chatModelId: uuidFromKey('zeta:corpus:gitlab-handbook:chat-model'),
      embeddingModelId: uuidFromKey(
        'zeta:corpus:gitlab-handbook:embedding-model',
      ),
      knowledgeBaseId: uuidFromKey(
        'zeta:corpus:gitlab-handbook:knowledge-base',
      ),
      rerankerModelId: uuidFromKey(
        'zeta:corpus:gitlab-handbook:reranker-model',
      ),
    });
  });
});
