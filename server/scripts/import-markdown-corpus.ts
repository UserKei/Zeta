import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentImportService } from '../src/knowledge-docs/document-import.service';
import { KnowledgeDocsService } from '../src/knowledge-docs/knowledge-docs.service';
import { PrismaService } from '@libs/shared';
import {
  AgentStatus,
  AiModelType,
  DocumentSourceType,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import {
  buildCorpusDocumentMetadata,
  buildCorpusResourceIds,
  findMarkdownCorpusFiles,
  loadMarkdownCorpusFile,
  type PreparedCorpusFile,
} from '../src/corpus-import/markdown-corpus.helpers';
import { getCorpusPreset } from '../src/corpus-import/corpus-presets';

type ImportStats = {
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
};

type ExistingImportDocument = {
  id: string;
  relativePath: string;
};

const WORKSPACE_ROOT = resolve(__dirname, '../..');
const DEFAULT_CHAT_MODEL_NAME = 'qwen-plus';
const DEFAULT_EMBEDDING_MODEL_NAME = 'text-embedding-v4';
const DEFAULT_RERANKER_MODEL_NAME = 'qwen3-rerank';
const ALIYUN_COMPATIBLE_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1';
const ALIYUN_RERANK_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-api/v1';

config({ path: resolve(WORKSPACE_ROOT, '.env') });
config();

async function main() {
  const presetKey = process.env.CORPUS_PRESET?.trim() || 'gitlab-handbook';
  const preset = getCorpusPreset(presetKey);

  if (!preset) {
    throw new Error(`Unknown corpus preset: ${presetKey}`);
  }

  const apiKey = readRequiredEnv('DASHSCOPE_API_KEY');
  const corpusRoot = resolveWorkspacePath(
    process.env.CORPUS_ROOT?.trim() || preset.defaultLocalPath,
  );
  const shouldReplace = readBooleanEnv('CORPUS_REPLACE');
  const limit = readPositiveIntegerEnv('CORPUS_LIMIT');

  await syncCorpusRepository(corpusRoot, preset.repoUrl, preset.defaultBranch);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService, { strict: false });
    const documentImportService = app.get(DocumentImportService, {
      strict: false,
    });
    const knowledgeDocsService = app.get(KnowledgeDocsService, {
      strict: false,
    });
    const sourceRef = await getGitRef(corpusRoot);
    const ids = buildCorpusResourceIds(preset.key);
    // Optional ids let advanced runs reuse existing resources; default runs
    // create stable evaluation resources for the preset.
    const resources = await upsertImportResources(prisma, {
      apiKey,
      agentId: process.env.CORPUS_AGENT_ID?.trim() || ids.agentId,
      agentName: process.env.CORPUS_AGENT_NAME?.trim() || preset.agentName,
      chatModelId: process.env.CORPUS_CHAT_MODEL_ID?.trim() || ids.chatModelId,
      embeddingModelId:
        process.env.CORPUS_EMBEDDING_MODEL_ID?.trim() || ids.embeddingModelId,
      importKey: preset.key,
      knowledgeBaseId: process.env.CORPUS_KB_ID?.trim() || ids.knowledgeBaseId,
      knowledgeBaseName:
        process.env.CORPUS_KB_NAME?.trim() || preset.knowledgeBaseName,
      rerankerModelId:
        process.env.CORPUS_RERANKER_MODEL_ID?.trim() || ids.rerankerModelId,
    });

    if (shouldReplace) {
      await removeImportedDocuments(
        prisma,
        knowledgeDocsService,
        resources.knowledgeBaseId,
        preset.key,
      );
    }

    const existingDocuments = shouldReplace
      ? new Map<string, ExistingImportDocument>()
      : await loadExistingImportDocuments(
          prisma,
          resources.knowledgeBaseId,
          preset.key,
        );
    const files = await findMarkdownCorpusFiles(corpusRoot, preset);
    const selectedFiles = limit ? files.slice(0, limit) : files;
    const stats: ImportStats = {
      discovered: files.length,
      imported: 0,
      skipped: 0,
      failed: 0,
    };

    for (const [index, file] of selectedFiles.entries()) {
      const progress = `[${index + 1}/${selectedFiles.length}]`;

      if (existingDocuments.has(file.relativePath)) {
        stats.skipped += 1;
        console.log(`${progress} skipped existing ${file.relativePath}`);
        continue;
      }

      const preparedFile = await loadMarkdownCorpusFile(file, preset);

      if (!preparedFile) {
        stats.skipped += 1;
        console.log(`${progress} skipped empty ${file.relativePath}`);
        continue;
      }

      try {
        console.log(`${progress} importing ${file.relativePath}`);
        await importPreparedFile(
          documentImportService,
          prisma,
          resources.knowledgeBaseId,
          preparedFile,
          buildCorpusDocumentMetadata(preset, {
            relativePath: preparedFile.relativePath,
            sourcePath: preparedFile.absolutePath,
            contentSha256: preparedFile.contentSha256,
            sourceRef,
            retrievalHints: preparedFile.retrievalHints,
          }),
        );
        stats.imported += 1;
        console.log(`${progress} imported ${file.relativePath}`);
      } catch (cause) {
        stats.failed += 1;
        console.warn(
          `[import-markdown-corpus] ${progress} failed ${file.relativePath}: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
      }
    }

    printSummary({
      agentId: resources.agentId,
      corpusRoot,
      knowledgeBaseId: resources.knowledgeBaseId,
      presetKey: preset.key,
      sourceRef,
      stats,
    });
  } finally {
    await app.close();
  }
}

async function upsertImportResources(
  prisma: PrismaService,
  input: {
    apiKey: string;
    agentId: string;
    agentName: string;
    chatModelId: string;
    embeddingModelId: string;
    importKey: string;
    knowledgeBaseId: string;
    knowledgeBaseName: string;
    rerankerModelId: string;
  },
) {
  await prisma.aiModel.upsert({
    where: { id: input.chatModelId },
    create: {
      id: input.chatModelId,
      name: `${input.knowledgeBaseName} Chat`,
      provider: 'aliyun-bailian',
      type: AiModelType.CHAT,
      modelName: process.env.CORPUS_CHAT_MODEL_NAME || DEFAULT_CHAT_MODEL_NAME,
      baseUrl: ALIYUN_COMPATIBLE_BASE_URL,
      apiKey: input.apiKey,
      isEnabled: true,
      configJson: {},
    },
    update: {
      apiKey: input.apiKey,
      isEnabled: true,
    },
  });

  await prisma.aiModel.upsert({
    where: { id: input.embeddingModelId },
    create: {
      id: input.embeddingModelId,
      name: `${input.knowledgeBaseName} Embedding`,
      provider: 'aliyun-bailian',
      type: AiModelType.EMBEDDING,
      modelName:
        process.env.CORPUS_EMBEDDING_MODEL_NAME || DEFAULT_EMBEDDING_MODEL_NAME,
      baseUrl: ALIYUN_COMPATIBLE_BASE_URL,
      apiKey: input.apiKey,
      isEnabled: true,
      configJson: { dimensions: 1024 },
    },
    update: {
      apiKey: input.apiKey,
      isEnabled: true,
    },
  });

  await prisma.aiModel.upsert({
    where: { id: input.rerankerModelId },
    create: {
      id: input.rerankerModelId,
      name: `${input.knowledgeBaseName} Reranker`,
      provider: 'aliyun-bailian',
      type: AiModelType.RERANKER,
      modelName:
        process.env.CORPUS_RERANKER_MODEL_NAME || DEFAULT_RERANKER_MODEL_NAME,
      baseUrl: ALIYUN_RERANK_BASE_URL,
      apiKey: input.apiKey,
      isEnabled: true,
      configJson: {},
    },
    update: {
      apiKey: input.apiKey,
      isEnabled: true,
    },
  });

  await prisma.knowledgeBase.upsert({
    where: { id: input.knowledgeBaseId },
    create: {
      id: input.knowledgeBaseId,
      name: input.knowledgeBaseName,
      description: 'Imported Markdown corpus for RAG evaluation.',
      status: KnowledgeBaseStatus.ACTIVE,
      embeddingModelId: input.embeddingModelId,
      rerankerModelId: input.rerankerModelId,
      chunkSize: 800,
      chunkOverlap: 100,
      metadata: {
        importKey: input.importKey,
        source: 'MARKDOWN_CORPUS',
      },
    },
    update: {
      name: input.knowledgeBaseName,
      status: KnowledgeBaseStatus.ACTIVE,
      embeddingModelId: input.embeddingModelId,
      rerankerModelId: input.rerankerModelId,
      metadata: {
        importKey: input.importKey,
        source: 'MARKDOWN_CORPUS',
      },
    },
  });

  await prisma.agent.upsert({
    where: { id: input.agentId },
    create: {
      id: input.agentId,
      name: input.agentName,
      description: 'RAG evaluation agent bound to the imported corpus.',
      modelId: input.chatModelId,
      status: AgentStatus.PUBLISHED,
      systemPrompt:
        'You are a handbook knowledge base assistant. Answer strictly from the retrieved context and keep citations available.',
      openingMessage: 'Ask me questions about the imported handbook.',
      temperature: 0.2,
      topP: 1,
      metadata: {
        importKey: input.importKey,
        source: 'MARKDOWN_CORPUS',
      },
    },
    update: {
      name: input.agentName,
      modelId: input.chatModelId,
      status: AgentStatus.PUBLISHED,
      metadata: {
        importKey: input.importKey,
        source: 'MARKDOWN_CORPUS',
      },
    },
  });

  await prisma.agentKnowledgeBase.upsert({
    where: {
      agentId_knowledgeBaseId: {
        agentId: input.agentId,
        knowledgeBaseId: input.knowledgeBaseId,
      },
    },
    create: {
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
    },
    update: {},
  });

  return {
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
  };
}

async function removeImportedDocuments(
  prisma: PrismaService,
  knowledgeDocsService: KnowledgeDocsService,
  knowledgeBaseId: string,
  importKey: string,
) {
  const documents = await loadExistingImportDocuments(
    prisma,
    knowledgeBaseId,
    importKey,
  );

  for (const document of documents.values()) {
    await knowledgeDocsService.remove(document.id);
  }
}

async function loadExistingImportDocuments(
  prisma: PrismaService,
  knowledgeBaseId: string,
  importKey: string,
) {
  const documents = await prisma.document.findMany({
    where: {
      knowledgeBaseId,
      sourceType: DocumentSourceType.FILE_UPLOAD,
    },
    select: {
      id: true,
      metadata: true,
    },
  });
  const importDocuments = new Map<string, ExistingImportDocument>();

  for (const document of documents) {
    const metadata = toJsonObject(document.metadata);
    const documentImportKey = metadata.importKey;
    const relativePath = metadata.relativePath;

    if (documentImportKey === importKey && typeof relativePath === 'string') {
      importDocuments.set(relativePath, {
        id: document.id,
        relativePath,
      });
    }
  }

  return importDocuments;
}

async function importPreparedFile(
  documentImportService: DocumentImportService,
  prisma: PrismaService,
  knowledgeBaseId: string,
  file: PreparedCorpusFile,
  metadata: Prisma.InputJsonObject,
) {
  const buffer = Buffer.from(file.content);
  const uploadedFile = {
    originalname: basename(file.relativePath),
    mimetype: 'text/markdown',
    size: buffer.byteLength,
    buffer,
  };
  const preview = await documentImportService.previewDocumentFiles(
    knowledgeBaseId,
    [uploadedFile],
  );
  const chunks = preview.files[0].chunks.map((chunk) => ({
    ...chunk,
    metadata: {
      ...(chunk.metadata ?? {}),
      relativePath: file.relativePath,
      retrievalHints: file.retrievalHints,
    },
  }));
  const result = await documentImportService.createFileDocuments(
    knowledgeBaseId,
    [uploadedFile],
    {
      documents: JSON.stringify([
        {
          fileIndex: 0,
          name: file.documentName,
          description: file.relativePath,
          chunks,
        },
      ]),
    },
  );
  const document = result.documents[0];
  const current = await prisma.document.findUnique({
    where: { id: document.id },
    select: { metadata: true },
  });

  await prisma.document.update({
    where: { id: document.id },
    data: {
      metadata: {
        ...toJsonObject(current?.metadata),
        ...metadata,
      },
    },
  });
}

async function syncCorpusRepository(
  corpusRoot: string,
  repoUrl: string,
  branch: string,
) {
  if (await pathExists(resolve(corpusRoot, '.git'))) {
    try {
      await runCommand('git', ['-C', corpusRoot, 'pull', '--ff-only']);
    } catch (cause) {
      console.warn(
        `[import-markdown-corpus] git pull failed, using existing local corpus: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
    return;
  }

  if (await pathExists(corpusRoot)) {
    throw new Error(
      `Corpus root already exists but is not a git repository: ${corpusRoot}`,
    );
  }

  await mkdir(dirname(corpusRoot), { recursive: true });
  await runCommand('git', [
    'clone',
    '--depth=1',
    '--branch',
    branch,
    repoUrl,
    corpusRoot,
  ]);
}

async function getGitRef(corpusRoot: string) {
  try {
    return (
      await runCommand('git', [
        '-C',
        corpusRoot,
        'rev-parse',
        '--short',
        'HEAD',
      ])
    ).trim();
  } catch {
    return null;
  }
}

async function runCommand(command: string, args: string[]) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with code ${code}: ${stderr}`,
        ),
      );
    });
  });
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readBooleanEnv(name: string) {
  return ['1', 'true', 'yes'].includes(
    process.env[name]?.trim().toLowerCase() ?? '',
  );
}

function readPositiveIntegerEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function resolveWorkspacePath(path: string) {
  return isAbsolute(path) ? path : resolve(WORKSPACE_ROOT, path);
}

async function pathExists(path: string) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toJsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Prisma.JsonValue>;
}

function printSummary(input: {
  agentId: string;
  corpusRoot: string;
  knowledgeBaseId: string;
  presetKey: string;
  sourceRef: string | null;
  stats: ImportStats;
}) {
  console.log('\nMarkdown corpus import complete');
  console.log(`Preset: ${input.presetKey}`);
  console.log(`Corpus root: ${input.corpusRoot}`);
  console.log(`Source ref: ${input.sourceRef ?? 'unknown'}`);
  console.log(`Knowledge base id: ${input.knowledgeBaseId}`);
  console.log(`Agent id: ${input.agentId}`);
  console.log(`Discovered: ${input.stats.discovered}`);
  console.log(`Imported: ${input.stats.imported}`);
  console.log(`Skipped: ${input.stats.skipped}`);
  console.log(`Failed: ${input.stats.failed}`);
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
