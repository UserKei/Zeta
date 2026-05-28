import { FileParserService } from './file-parser.service';
import { HtmlParserService } from './html-parser.service';
import { MarkdownParserService } from './markdown-parser.service';
import { TextParserService } from './text-parser.service';
import { TextSplitterService } from '../text-splitter/text-splitter.service';

describe('FileParserService', () => {
  const textSplitter = new TextSplitterService();
  const service = new FileParserService(
    new MarkdownParserService(textSplitter),
    new TextParserService(textSplitter),
    new HtmlParserService(textSplitter),
  );

  it('parses txt files into chunks', () => {
    const result = service.parse({
      fileName: '员工手册.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一段内容。\n\n第二段内容。'),
    });

    expect(result).toMatchObject({
      fileName: '员工手册.txt',
      documentName: '员工手册',
      sourceFormat: 'TEXT',
      chunks: [
        {
          title: '员工手册',
          content: '第一段内容。\n\n第二段内容。',
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('strips scripts styles and tags from html files', () => {
    const result = service.parse({
      fileName: '制度说明.html',
      mimeType: 'text/html',
      buffer: Buffer.from(
        '<h1>制度说明</h1><script>alert(1)</script><style>.a{}</style><p>正文内容</p>',
      ),
    });

    expect(result.sourceFormat).toBe('HTML');
    expect(result.documentName).toBe('制度说明');
    expect(result.chunks[0]).toMatchObject({
      title: '制度说明',
      content: '制度说明\n正文内容',
      status: 'ACTIVE',
    });
  });

  it('routes markdown files through the markdown parser', () => {
    const result = service.parse({
      fileName: '流程.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# 流程\n正文内容'),
    });

    expect(result).toMatchObject({
      documentName: '流程',
      sourceFormat: 'MARKDOWN',
      chunks: [{ title: '流程', content: '正文内容', status: 'ACTIVE' }],
    });
  });

  it('rejects unsupported file extensions', () => {
    expect(() =>
      service.parse({
        fileName: '合同.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake'),
      }),
    ).toThrow('暂不支持该文件类型');
  });
});
