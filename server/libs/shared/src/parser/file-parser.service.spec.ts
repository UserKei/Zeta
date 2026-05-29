import * as XLSX from 'xlsx';
import { DocxParserService } from './docx-parser.service';
import { FileParserService } from './file-parser.service';
import { HtmlParserService } from './html-parser.service';
import { MarkdownParserService } from './markdown-parser.service';
import { PdfParserService } from './pdf-parser.service';
import { SpreadsheetParserService } from './spreadsheet-parser.service';
import { TextParserService } from './text-parser.service';
import { TextSplitterService } from '../text-splitter/text-splitter.service';

describe('FileParserService', () => {
  const textSplitter = new TextSplitterService();
  const service = new FileParserService(
    new MarkdownParserService(textSplitter),
    new TextParserService(textSplitter),
    new HtmlParserService(textSplitter),
    new PdfParserService(textSplitter),
    new DocxParserService(textSplitter),
    new SpreadsheetParserService(),
  );

  const createPdfBuffer = (text: string) => {
    const stream = `BT /F1 16 Tf 72 720 Td (${text}) Tj ET`;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    ];
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];

    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(body, 'latin1'));
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(body, 'latin1');
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    body += offsets
      .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
      .join('');
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body, 'latin1');
  };

  const createDocxBuffer = () =>
    Buffer.from(
      'UEsDBBQAAAAIAO9mvVzXeYTq8QAAALgBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE730Ky9cqccoBIZSkB36OwKE8wMreJFb9J69b2rdn00KREOVozXwz62nXB+/EHjPZGDq5qhspMOhobBg7+b55ru6koALBgIsBO3lEkut+0W6OCUkwHKiTUynpXinSE3qgOiYMrAwxeyj8zKNKoLcworppmlulYygYSlXmDNkvhGgfcYCdK+LpwMr5loyOpHg4e+e6TkJKzmoorKt9ML+Kqq+SmsmThyabaMkGqa6VzOL1jh/0lSfK1qB4g1xewLNRfcRslIl65xmu/0/649o4DFbjhZ/TUo4aiXh77+qL4sGG71+06jR8/wlQSwMEFAAAAAgA72a9XCAbhuqyAAAALgEAAAsAAABfcmVscy8ucmVsc43Puw6CMBQG4J2naM4uBQdjDIXFmLAafICmPZRGeklbL7y9HRzEODie23fyN93TzOSOIWpnGdRlBQStcFJbxeAynDZ7IDFxK/nsLDJYMELXFs0ZZ57yTZy0jyQjNjKYUvIHSqOY0PBYOo82T0YXDE+5DIp6Lq5cId1W1Y6GTwPagpAVS3rJIPSyBjIsHv/h3ThqgUcnbgZt+vHlayPLPChMDB4uSCrf7TKzQHNKuorZvgBQSwMEFAAAAAgA72a9XKUBqqgeAQAAiwEAABEAAAB3b3JkL2RvY3VtZW50LnhtbI2QwUrDQBCG732KZe92tx5EQpLefAJ9gJisbSDZDbvR2Fu0FKoiKFRUVEorLTloTsGaHHwZuzF5C5MWbwpefv5/hvmGGbV97DrgiHBhM6rBVhNDQKjJLJt2NLi3u7OxDYHwDWoZDqNEgz0iYFtvqIFiMfPQJdQHFYEKJdBg1/c9BSFhdolriCbzCK16B4y7hl9F3kEB45bHmUmEqBa4DtrEeAu5hk2h3gCgou4zq1fbVfD0Sngtvi6v7+Rilp/PylEoh28ym6uortfKV+r9PhdP8+Eiv3iQH4MiSb9Gkby8yV8m5f1VOX1avmeghTEGctD/DE//iRynRfy6hpWPYTE/KftReRsVybhInpdZJuNJfpb+xavN+sza/bxR/wZQSwECFAMUAAAACADvZr1c13mE6vEAAAC4AQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAO9mvVwgG4bqsgAAAC4BAAALAAAAAAAAAAAAAACAASIBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAO9mvVylAaqoHgEAAIsBAAARAAAAAAAAAAAAAACAAf0BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAABKAwAAAAA=',
      'base64',
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

  it('parses txt files into chunks', async () => {
    const result = await service.parse({
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

  it('strips scripts styles and tags from html files', async () => {
    const result = await service.parse({
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

  it('parses text pdf files into chunks', async () => {
    const result = await service.parse({
      fileName: '报销制度.pdf',
      mimeType: 'application/pdf',
      buffer: createPdfBuffer('Expense approval limit is 1000 yuan'),
    });

    expect(result).toMatchObject({
      fileName: '报销制度.pdf',
      documentName: '报销制度',
      sourceFormat: 'PDF',
      chunks: [
        {
          title: '报销制度',
          status: 'ACTIVE',
        },
      ],
    });
    expect(result.chunks[0]?.content).toContain('Expense approval limit');
  });

  it('rejects pdf files without extractable text', async () => {
    await expect(
      service.parse({
        fileName: '扫描件.pdf',
        mimeType: 'application/pdf',
        buffer: createPdfBuffer(''),
      }),
    ).rejects.toThrow('PDF 文件没有可解析文本');
  });

  it('rejects damaged pdf files', async () => {
    await expect(
      service.parse({
        fileName: '损坏.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not a pdf'),
      }),
    ).rejects.toThrow('PDF 文件解析失败');
  });

  it('parses docx files into chunks', async () => {
    const result = await service.parse({
      fileName: '员工报销制度.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: createDocxBuffer(),
    });

    expect(result).toMatchObject({
      fileName: '员工报销制度.docx',
      documentName: '员工报销制度',
      sourceFormat: 'DOCX',
      chunks: [
        {
          title: '员工报销制度',
          status: 'ACTIVE',
        },
      ],
    });
    expect(result.chunks[0]?.content).toContain(
      '客户招待费用单次限额为 1000 元',
    );
  });

  it('rejects damaged docx files', async () => {
    await expect(
      service.parse({
        fileName: '损坏.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('not a docx'),
      }),
    ).rejects.toThrow('DOCX 文件解析失败');
  });

  it('routes markdown files through the markdown parser', async () => {
    const result = await service.parse({
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

  it('parses csv rows into structured chunks', async () => {
    const result = await service.parse({
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

  it('ignores blank csv rows and empty columns while preserving Chinese headers', async () => {
    const result = await service.parse({
      fileName: '系统权限清单.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '系统,默认开通,,说明\n飞书,是,,用于 IM 协作\n,,,\nVPN,否,,需要主管审批\n报销系统,,,\n',
      ),
    });

    expect(result).toMatchObject({
      fileName: '系统权限清单.csv',
      documentName: '系统权限清单',
      sourceFormat: 'CSV',
      chunks: [
        {
          title: '系统权限清单 / 第 2 行',
          content: '系统: 飞书; 默认开通: 是; 说明: 用于 IM 协作',
          status: 'ACTIVE',
        },
        {
          title: '系统权限清单 / 第 3 行',
          content: '系统: VPN; 默认开通: 否; 说明: 需要主管审批',
          status: 'ACTIVE',
        },
        {
          title: '系统权限清单 / 第 4 行',
          content: '系统: 报销系统',
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('rejects spreadsheet rows longer than the configured chunk length', async () => {
    await expect(
      service.parse(
        {
          fileName: '超长表格.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(`字段\n${'内容'.repeat(20)}`),
        },
        { maxChunkLength: 10 },
      ),
    ).rejects.toThrow('chunk length cannot exceed 10');
  });

  it('parses xlsx sheets into structured chunks', async () => {
    const result = await service.parse({
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

  it('parses xls files through the spreadsheet parser', async () => {
    const result = await service.parse({
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

  it('rejects spreadsheets without effective rows', async () => {
    await expect(
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
    ).rejects.toThrow('表格文件没有有效数据');
  });

  it('rejects unsupported file extensions', async () => {
    await expect(
      service.parse({
        fileName: '合同.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake'),
      }),
    ).rejects.toThrow('暂不支持该文件类型');
  });
});
