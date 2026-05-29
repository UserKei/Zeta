import * as XLSX from 'xlsx';
import { FileParserService } from './file-parser.service';
import { HtmlParserService } from './html-parser.service';
import { MarkdownParserService } from './markdown-parser.service';
import { SpreadsheetParserService } from './spreadsheet-parser.service';
import { TextParserService } from './text-parser.service';
import { TextSplitterService } from '../text-splitter/text-splitter.service';

describe('FileParserService', () => {
  const textSplitter = new TextSplitterService();
  const service = new FileParserService(
    new MarkdownParserService(textSplitter),
    new TextParserService(textSplitter),
    new HtmlParserService(textSplitter),
    new SpreadsheetParserService(),
  );

  const createWorkbookBuffer = (
    sheets: Array<{ name: string; rows: unknown[][] }>,
    bookType: XLSX.BookType = 'xlsx',
  ) => {
    const workbook = XLSX.utils.book_new();

    for (const sheet of sheets) {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(sheet.rows),
        sheet.name,
      );
    }

    return XLSX.write(workbook, { type: 'buffer', bookType }) as Buffer;
  };

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

  it('parses csv rows into structured chunks', () => {
    const result = service.parse({
      fileName: '权限矩阵.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '系统,默认开通,说明\n飞书,是,用于 IM\nVPN,否,需要主管审批',
      ),
    });

    expect(result).toMatchObject({
      fileName: '权限矩阵.csv',
      documentName: '权限矩阵',
      sourceFormat: 'CSV',
      chunks: [
        {
          title: '权限矩阵 / 第 2 行',
          content: '系统: 飞书; 默认开通: 是; 说明: 用于 IM',
          status: 'ACTIVE',
        },
        {
          title: '权限矩阵 / 第 3 行',
          content: '系统: VPN; 默认开通: 否; 说明: 需要主管审批',
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('parses xlsx sheets into structured chunks', () => {
    const result = service.parse({
      fileName: '权限表.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createWorkbookBuffer([
        {
          name: '默认权限',
          rows: [
            ['系统', '默认开通'],
            ['飞书', '是'],
          ],
        },
        {
          name: '审批路径',
          rows: [
            ['事项', '审批人'],
            ['VPN', '直属主管'],
          ],
        },
      ]),
    });

    expect(result).toMatchObject({
      fileName: '权限表.xlsx',
      documentName: '权限表',
      sourceFormat: 'EXCEL',
      chunks: [
        {
          title: '权限表 / 默认权限 / 第 2 行',
          content: '系统: 飞书; 默认开通: 是',
          status: 'ACTIVE',
        },
        {
          title: '权限表 / 审批路径 / 第 2 行',
          content: '事项: VPN; 审批人: 直属主管',
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('parses xls files through the spreadsheet parser', () => {
    const result = service.parse({
      fileName: '旧版表格.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: createWorkbookBuffer(
        [
          {
            name: 'Sheet1',
            rows: [
              ['字段', '值'],
              ['状态', '启用'],
            ],
          },
        ],
        'xls',
      ),
    });

    expect(result).toMatchObject({
      fileName: '旧版表格.xls',
      documentName: '旧版表格',
      sourceFormat: 'EXCEL',
      chunks: [
        {
          title: '旧版表格 / 第 2 行',
          content: '字段: 状态; 值: 启用',
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('rejects spreadsheets without effective rows', () => {
    expect(() =>
      service.parse({
        fileName: '空表.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: createWorkbookBuffer([
          {
            name: 'Sheet1',
            rows: [['系统', '说明']],
          },
        ]),
      }),
    ).toThrow('表格文件没有有效数据');
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
