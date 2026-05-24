import { MarkdownParserService } from './markdown-parser.service';
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

  it('uses heading hierarchy as chunk title', () => {
    const chunks = service.parse('# 一级\n介绍\n## 二级\n内容', {
      maxChunkLength: 1000,
      maxChunkCount: 20,
    });

    expect(chunks).toMatchObject([
      { title: '一级', content: '介绍' },
      { title: '一级 二级', content: '内容' },
    ]);
  });
});
