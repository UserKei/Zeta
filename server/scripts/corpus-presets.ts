export type CorpusPreset = {
  key: string;
  source: string;
  repoUrl: string;
  defaultBranch: string;
  defaultLocalPath: string;
  knowledgeBaseName: string;
  agentName: string;
  includePrefixes: string[];
  fileExtensions: string[];
  ignoredDirectoryNames: string[];
};

export const gitlabHandbookPreset = {
  key: 'gitlab-handbook',
  source: 'GITLAB_HANDBOOK',
  repoUrl: 'https://gitlab.com/gitlab-com/content-sites/handbook.git',
  defaultBranch: 'main',
  defaultLocalPath: 'example/corpora/gitlab-handbook',
  knowledgeBaseName: 'GitLab Handbook',
  agentName: 'GitLab Handbook Expert',
  includePrefixes: ['content/'],
  fileExtensions: ['.md'],
  ignoredDirectoryNames: [
    '.git',
    '.next',
    '.nuxt',
    '.output',
    'assets',
    'build',
    'dist',
    'node_modules',
    'public',
    'static',
    'vendor',
  ],
} as const satisfies CorpusPreset;

export const corpusPresets = [gitlabHandbookPreset] as const;

export const getCorpusPreset = (key: string) =>
  corpusPresets.find((preset) => preset.key === key) ?? null;
