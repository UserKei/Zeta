import { MarkdownParserService } from './document/markdown-parser.service';
import { TextSplitterService } from '../text-splitter/text-splitter.service';

describe('MarkdownParserService', () => {
  const service = new MarkdownParserService(new TextSplitterService());

  it('keeps headings inside fenced code blocks as content', () => {
    const chunks = service.parse('# 文档\n```ts\n# 不是标题\n```\n正文', {
      maxChunkLength: 1000,
      maxChunkCount: 20,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      title: '文档',
      content: '```ts\n# 不是标题\n```\n正文',
      status: 'ACTIVE',
    });
  });

  it('uses heading hierarchy as chunk title for real content', () => {
    const chunks = service.parse('# 一级\n介绍\n## 二级\n内容', {
      maxChunkLength: 1000,
      maxChunkCount: 20,
    });

    expect(chunks).toMatchObject([
      { title: '一级', content: '介绍' },
      { title: '一级 二级', content: '内容' },
    ]);
  });

  it('skips heading-only sections instead of creating fake chunks', () => {
    const chunks = service.parse(
      '# 企业内部知识库测试文档\n## 1. 员工入职 IT 账号开通流程\n### 1.1 适用范围\n本流程适用于正式员工。',
      {
        maxChunkLength: 1000,
        maxChunkCount: 20,
      },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      title: '企业内部知识库测试文档 1. 员工入职 IT 账号开通流程 1.1 适用范围',
      content: '本流程适用于正式员工。',
      status: 'ACTIVE',
    });
  });

  it('strips leading yaml frontmatter before parsing chunks', () => {
    const chunks = service.parse(
      '---\nid: demo\ntitle: 企业内部知识库测试文档\n---\n# 企业内部知识库测试文档\n正文内容',
      {
        maxChunkLength: 1000,
        maxChunkCount: 20,
      },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      title: '企业内部知识库测试文档',
      content: '正文内容',
      status: 'ACTIVE',
    });
  });

  it('uses configured overlap when splitting long section content', () => {
    const chunks = service.parse('# 文档\nabcdefghij', {
      maxChunkLength: 5,
      overlapLength: 2,
      maxChunkCount: 20,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'abcde',
      'defgh',
      'ghij',
    ]);
  });
});
