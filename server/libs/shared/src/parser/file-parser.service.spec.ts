import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FileParserService } from './core/file-parser.service';
import { DocxParserService } from './document/docx-parser.service';
import { HtmlParserService } from './document/html-parser.service';
import { MarkdownParserService } from './document/markdown-parser.service';
import { PdfParserService } from './document/pdf-parser.service';
import { TextParserService } from './document/text-parser.service';
import { SpreadsheetParserService } from './table/spreadsheet-parser.service';
import { TextSplitterService } from '../text-splitter/text-splitter.service';

describe('FileParserService', () => {
  const textSplitter = new TextSplitterService();
  const markdownParser = new MarkdownParserService(textSplitter);
  const service = new FileParserService(
    markdownParser,
    new TextParserService(textSplitter),
    new HtmlParserService(textSplitter),
    new PdfParserService(markdownParser),
    new DocxParserService(markdownParser),
    new SpreadsheetParserService(),
  );

  const escapePdfText = (text: string) =>
    text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

  const createPdfBuffer = (text: string) =>
    createPdfBufferWithLines([
      {
        text,
        fontSize: 16,
        x: 72,
        y: 720,
      },
    ]);

  const createPdfContentStream = (
    lines: Array<{ text: string; fontSize: number; x: number; y: number }>,
  ) =>
    lines
      .map(
        (line) =>
          `BT /F1 ${line.fontSize} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`,
      )
      .join('\n');

  const buildPdfBuffer = (objects: string[]) => {
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

  const createPdfBufferWithLines = (
    lines: Array<{ text: string; fontSize: number; x: number; y: number }>,
  ) => {
    const stream = createPdfContentStream(lines);
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    ];

    return buildPdfBuffer(objects);
  };

  const createOutlinedPdfBuffer = () => {
    const pageOneStream = createPdfContentStream([
      { text: 'Section One Body', fontSize: 12, x: 72, y: 720 },
      {
        text: 'VPN access requires manager approval.',
        fontSize: 12,
        x: 72,
        y: 700,
      },
    ]);
    const pageTwoStream = createPdfContentStream([
      { text: 'Section Two Body', fontSize: 12, x: 72, y: 720 },
      {
        text: 'Contracts must be archived within five days.',
        fontSize: 12,
        x: 72,
        y: 700,
      },
    ]);

    return buildPdfBuffer([
      '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(pageOneStream, 'latin1')} >>\nstream\n${pageOneStream}\nendstream`,
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 7 0 R >>',
      `<< /Length ${Buffer.byteLength(pageTwoStream, 'latin1')} >>\nstream\n${pageTwoStream}\nendstream`,
      '<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>',
      '<< /Title (VPN Chapter) /Parent 8 0 R /Next 10 0 R /Dest [3 0 R /XYZ null null null] >>',
      '<< /Title (Archive Chapter) /Parent 8 0 R /Prev 9 0 R /Dest [6 0 R /XYZ null null null] >>',
    ]);
  };

  const createLinkedPdfBuffer = () => {
    const tocStream = createPdfContentStream([
      { text: 'Table of Contents', fontSize: 16, x: 72, y: 720 },
      { text: 'VPN Rules', fontSize: 12, x: 72, y: 690 },
    ]);
    const pageTwoStream = createPdfContentStream([
      { text: 'VPN Rules', fontSize: 16, x: 72, y: 720 },
      {
        text: 'VPN permission becomes effective after approval.',
        fontSize: 12,
        x: 72,
        y: 690,
      },
    ]);

    return buildPdfBuffer([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R /Annots [8 0 R] >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(tocStream, 'latin1')} >>\nstream\n${tocStream}\nendstream`,
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 7 0 R >>',
      `<< /Length ${Buffer.byteLength(pageTwoStream, 'latin1')} >>\nstream\n${pageTwoStream}\nendstream`,
      '<< /Type /Annot /Subtype /Link /Rect [72 680 180 705] /Border [0 0 0] /Dest [6 0 R /XYZ null null null] >>',
    ]);
  };

  const createDocxBuffer = () =>
    Buffer.from(
      'UEsDBBQAAAAIAO9mvVzXeYTq8QAAALgBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE730Ky9cqccoBIZSkB36OwKE8wMreJFb9J69b2rdn00KREOVozXwz62nXB+/EHjPZGDq5qhspMOhobBg7+b55ru6koALBgIsBO3lEkut+0W6OCUkwHKiTUynpXinSE3qgOiYMrAwxeyj8zKNKoLcworppmlulYygYSlXmDNkvhGgfcYCdK+LpwMr5loyOpHg4e+e6TkJKzmoorKt9ML+Kqq+SmsmThyabaMkGqa6VzOL1jh/0lSfK1qB4g1xewLNRfcRslIl65xmu/0/649o4DFbjhZ/TUo4aiXh77+qL4sGG71+06jR8/wlQSwMEFAAAAAgA72a9XCAbhuqyAAAALgEAAAsAAABfcmVscy8ucmVsc43Puw6CMBQG4J2naM4uBQdjDIXFmLAafICmPZRGeklbL7y9HRzEODie23fyN93TzOSOIWpnGdRlBQStcFJbxeAynDZ7IDFxK/nsLDJYMELXFs0ZZ57yTZy0jyQjNjKYUvIHSqOY0PBYOo82T0YXDE+5DIp6Lq5cId1W1Y6GTwPagpAVS3rJIPSyBjIsHv/h3ThqgUcnbgZt+vHlayPLPChMDB4uSCrf7TKzQHNKuorZvgBQSwMEFAAAAAgA72a9XKUBqqgeAQAAiwEAABEAAAB3b3JkL2RvY3VtZW50LnhtbI2QwUrDQBCG732KZe92tx5EQpLefAJ9gJisbSDZDbvR2Fu0FKoiKFRUVEorLTloTsGaHHwZuzF5C5MWbwpefv5/hvmGGbV97DrgiHBhM6rBVhNDQKjJLJt2NLi3u7OxDYHwDWoZDqNEgz0iYFtvqIFiMfPQJdQHFYEKJdBg1/c9BSFhdolriCbzCK16B4y7hl9F3kEB45bHmUmEqBa4DtrEeAu5hk2h3gCgou4zq1fbVfD0Sngtvi6v7+Rilp/PylEoh28ym6uortfKV+r9PhdP8+Eiv3iQH4MiSb9Gkby8yV8m5f1VOX1avmeghTEGctD/DE//iRynRfy6hpWPYTE/KftReRsVybhInpdZJuNJfpb+xavN+sza/bxR/wZQSwECFAMUAAAACADvZr1c13mE6vEAAAC4AQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAO9mvVwgG4bqsgAAAC4BAAALAAAAAAAAAAAAAACAASIBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAO9mvVylAaqoHgEAAIsBAAARAAAAAAAAAAAAAACAAf0BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAABKAwAAAAA=',
      'base64',
    );

  const createDocxWithImageBuffer = () =>
    Buffer.from(
      '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',
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

  const readDemoFile = (fileName: string) =>
    readFileSync(join(__dirname, '../../../../../docs/demo', fileName));

  const readDemoMediaFile = (fileName: string) =>
    readDemoFile(join('media', fileName));

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

  it('keeps adjacent Chinese pdf text items together', async () => {
    const result = await service.parse({
      fileName: 'procurement-contract-approval.pdf',
      mimeType: 'application/pdf',
      buffer: readDemoFile('procurement-contract-approval.pdf'),
    });
    const content = result.chunks
      .map((chunk) => `${chunk.title ?? ''}\n${chunk.content}`)
      .join('\n');

    expect(content).toContain('审批前准备材料');
    expect(content).not.toContain('审 批 前准 备 材 料');
  });

  it('parses demo multimodal pdf files as text documents', async () => {
    const files = ['approval-flow.pdf', 'risk-rules.pdf'];

    for (const fileName of files) {
      const result = await service.parse({
        fileName,
        mimeType: 'application/pdf',
        buffer: readDemoMediaFile(fileName),
      });
      const content = result.chunks
        .map((chunk) => `${chunk.title ?? ''}\n${chunk.content}`)
        .join('\n');
      const normalizedContent = content.normalize('NFKC');

      expect(result.sourceFormat).toBe('PDF');
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.assets ?? []).toEqual([]);
      expect(normalizedContent).toContain('图示');
      expect(normalizedContent).toContain('图片理解能力');
    }
  });

  it('infers pdf sections from larger font sizes', async () => {
    const result = await service.parse({
      fileName: '采购制度.pdf',
      mimeType: 'application/pdf',
      buffer: createPdfBufferWithLines([
        { text: 'Procurement Approval', fontSize: 20, x: 72, y: 720 },
        {
          text: 'Contracts over 100000 require finance review.',
          fontSize: 12,
          x: 72,
          y: 690,
        },
        {
          text: 'Legal review is required before signing.',
          fontSize: 12,
          x: 72,
          y: 670,
        },
        { text: 'Archive Rules', fontSize: 18, x: 72, y: 630 },
        {
          text: 'Signed contracts must be archived within 5 days.',
          fontSize: 12,
          x: 72,
          y: 600,
        },
        {
          text: 'The owner keeps the original contract.',
          fontSize: 12,
          x: 72,
          y: 580,
        },
      ]),
    });

    expect(result.sourceFormat).toBe('PDF');
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('Procurement Approval') &&
          chunk.content.includes('finance review'),
      ),
    ).toBe(true);
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('Archive Rules') &&
          chunk.content.includes('archived within 5 days'),
      ),
    ).toBe(true);
  });

  it('uses pdf outline entries as section titles when available', async () => {
    const result = await service.parse({
      fileName: '目录文档.pdf',
      mimeType: 'application/pdf',
      buffer: createOutlinedPdfBuffer(),
    });

    expect(result.sourceFormat).toBe('PDF');
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('VPN Chapter') &&
          chunk.content.includes('manager approval'),
      ),
    ).toBe(true);
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('Archive Chapter') &&
          chunk.content.includes('archived within five days'),
      ),
    ).toBe(true);
  });

  it('uses internal pdf links as section anchors when outline is absent', async () => {
    const result = await service.parse({
      fileName: '链接目录.pdf',
      mimeType: 'application/pdf',
      buffer: createLinkedPdfBuffer(),
    });

    expect(result.sourceFormat).toBe('PDF');
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('VPN Rules') &&
          chunk.content.includes('effective after approval'),
      ),
    ).toBe(true);
  });

  it('renders pdf pages as image assets when text cannot be extracted', async () => {
    const result = await service.parse({
      fileName: '扫描件.pdf',
      mimeType: 'application/pdf',
      buffer: createPdfBuffer(''),
    });

    expect(result).toMatchObject({
      fileName: '扫描件.pdf',
      documentName: '扫描件',
      sourceFormat: 'PDF',
      chunks: [
        {
          title: '扫描件 / 第 1 页',
          status: 'ACTIVE',
          metadata: {
            contentKind: 'PDF_PAGE_IMAGE',
            assetReference: './files/page-1.png',
            pageNumber: 1,
          },
        },
      ],
      assets: [
        {
          source: 'PDF_PAGE_SCREENSHOT',
          fileName: 'page-1.png',
          mimeType: 'image/png',
          reference: './files/page-1.png',
        },
      ],
    });
    expect(result.chunks[0]?.content).toContain(
      '![扫描件 第 1 页](./files/page-1.png)',
    );
    expect(result.assets?.[0]?.buffer.byteLength).toBeGreaterThan(0);
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

  it('keeps docx heading structure when creating chunks', async () => {
    const result = await service.parse({
      fileName: '员工入职 IT 账号开通流程.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: readDemoFile('it-account-onboarding.docx'),
    });

    expect(result.sourceFormat).toBe('DOCX');
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('适用范围') &&
          chunk.content.includes('本文适用于正式员工'),
      ),
    ).toBe(true);
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('默认开通系统') &&
          chunk.content.includes('| 系统 | 默认开通 | 说明 |'),
      ),
    ).toBe(true);
    expect(
      result.chunks.some(
        (chunk) =>
          chunk.title?.includes('VPN 权限申请') &&
          chunk.content.includes('VPN 权限默认不自动开通'),
      ),
    ).toBe(true);
  });

  it('extracts docx images as parser assets and keeps markdown references', async () => {
    expect(createDocxWithImageBuffer().byteLength).toBeGreaterThan(0);

    const result = await service.parse({
      fileName: '网络拓扑.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(
        'UEsDBAoAAAAAADSFvlygpfcK4QEAAOEBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFR5cGVzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L2NvbnRlbnQtdHlwZXMiPjxEZWZhdWx0IEV4dGVuc2lvbj0icmVscyIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1mb3JtYXRzLXBhY2thZ2UucmVsYXRpb25zaGlwcyt4bWwiLz48RGVmYXVsdCBFeHRlbnNpb249InhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3htbCIvPjxEZWZhdWx0IEV4dGVuc2lvbj0icG5nIiBDb250ZW50VHlwZT0iaW1hZ2UvcG5nIi8+PE92ZXJyaWRlIFBhcnROYW1lPSIvd29yZC9kb2N1bWVudC54bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC5kb2N1bWVudC5tYWluK3htbCIvPjwvVHlwZXM+Ck1QSwMECgAAAAAANIW+XAAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAAANIW+XDpJG4ArAQAAKwEAAAsAAABfcmVscy8ucmVsczw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFJlbGF0aW9uc2hpcHMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwcyI+PFJlbGF0aW9uc2hpcCBJZD0icklkMSIgVHlwZT0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9vZmZpY2VEb2N1bWVudCIgVGFyZ2V0PSJ3b3JkL2RvY3VtZW50LnhtbCIvPjwvUmVsYXRpb25zaGlwcz4KUEsDBAoAAAAAADSFvlwAAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAAANIW+XCUEq5bXAgAA1wIAABEAAAB3b3JkL2RvY3VtZW50LnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPHc6ZG9jdW1lbnQgeG1sbnM6dz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3dvcmRwcm9jZXNzaW5nbWwvMjAwNi9tYWluIiB4bWxuczpyPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzIiB4bWxuczp3cD0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL2RyYXdpbmdtbC8yMDA2L3dvcmRwcm9jZXNzaW5nRHJhd2luZyIgeG1sbnM6YT0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL2RyYXdpbmdtbC8yMDA2L21haW4iIHhtbG5zOnBpYz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL2RyYXdpbmdtbC8yMDA2L3BpY3R1cmUiPjx3OmJvZHk+PHc6cD48dzpyPjx3OnQ+5LiL5Zu+5bGV56S6IFZQTiDorr/pl67ot6/lvoTjgII8L3c6dD48L3c6cj48L3c6cD48dzpwPjx3OnI+PHc6ZHJhd2luZz48d3A6aW5saW5lPjxhOmdyYXBoaWM+PGE6Z3JhcGhpY0RhdGE+PHBpYzpwaWM+PHBpYzpibGlwRmlsbD48YTpibGlwIHI6ZW1iZWQ9InJJZEltYWdlMSIvPjwvcGljOmJsaXBGaWxsPjwvcGljOnBpYz48L2E6Z3JhcGhpY0RhdGE+PC9hOmdyYXBoaWM+PC93cDppbmxpbmU+PC93OmRyYXdpbmc+PC93OnI+PC93OnA+PC93OmJvZHk+PC93OmRvY3VtZW50PgpQSwMECgAAAAAANIW+XAAAAAAAAAAAAAAAAAsAAAB3b3JkL19yZWxzL1BLAwQKAAAAAAA0hb5cUXX6iSYBAAAmAQAAHAAAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHM8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+CjxSZWxhdGlvbnNoaXBzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L3JlbGF0aW9uc2hpcHMiPjxSZWxhdGlvbnNoaXAgSWQ9InJJZEltYWdlMSIgVHlwZT0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9pbWFnZSIgVGFyZ2V0PSJtZWRpYS9pbWFnZTEucG5nIi8+PC9SZWxhdGlvbnNoaXBzPgpQSwMECgAAAAAANIW+XAAAAAAAAAAAAAAAAAsAAAB3b3JkL21lZGlhL1BLAwQKAAAAAAA0hb5cHXsgXkYAAABGAAAAFQAAAHdvcmQvbWVkaWEvaW1hZ2UxLnBuZ4lQTkcNChoKAAAADUlIRFIAAAABAAAAAQgGAAAAHxXEiQAAAA1JREFUeNpj/M/AUA8ABYMCf5XLemAAAAAASUVORK5CYIJQSwECHgMKAAAAAAA0hb5coKX3CuEBAADhAQAAEwAAAAAAAAAAAAAApIEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIeAwoAAAAAADSFvlwAAAAAAAAAAAAAAAAGAAAAAAAAAAAAEADtQRICAABfcmVscy9QSwECHgMKAAAAAAA0hb5cOkkbgCsBAAArAQAACwAAAAAAAAAAAAAApIE2AgAAX3JlbHMvLnJlbHNQSwECHgMKAAAAAAA0hb5cAAAAAAAAAAAAAAAABQAAAAAAAAAAABAA7UGKAwAAd29yZC9QSwECHgMKAAAAAAA0hb5cJQSrltcCAADXAgAAEQAAAAAAAAAAAAAApIGtAwAAd29yZC9kb2N1bWVudC54bWxQSwECHgMKAAAAAAA0hb5cAAAAAAAAAAAAAAAACwAAAAAAAAAAABAA7UGzBgAAd29yZC9fcmVscy9QSwECHgMKAAAAAAA0hb5cUXX6iSYBAAAmAQAAHAAAAAAAAAAAAAAApIHcBgAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc1BLAQIeAwoAAAAAADSFvlwAAAAAAAAAAAAAAAALAAAAAAAAAAAAEADtQTwIAAB3b3JkL21lZGlhL1BLAQIeAwoAAAAAADSFvlwdeyBeRgAAAEYAAAAVAAAAAAAAAAAAAACkgWUIAAB3b3JkL21lZGlhL2ltYWdlMS5wbmdQSwUGAAAAAAkACQAfAgAA3ggAAAAA',
        'base64',
      ),
    });

    expect(result.assets).toEqual([
      expect.objectContaining({
        fileName: 'image1.png',
        mimeType: 'image/png',
        reference: './files/image1.png',
        source: 'DOCX_IMAGE',
      }),
    ]);
    expect(result.assets?.[0]?.buffer.byteLength).toBeGreaterThan(0);
    expect(result.chunks[0]?.content).toContain(
      '![image1.png](./files/image1.png)',
    );
  });

  it('extracts images from demo multimodal docx files', async () => {
    const files = ['approval-flow.docx', 'risk-rules.docx'];

    for (const fileName of files) {
      const result = await service.parse({
        fileName,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: readDemoMediaFile(fileName),
      });
      const content = result.chunks.map((chunk) => chunk.content).join('\n');

      expect(result.sourceFormat).toBe('DOCX');
      expect(result.assets?.length).toBeGreaterThan(0);
      expect(result.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'DOCX_IMAGE',
            mimeType: 'image/png',
          }),
        ]),
      );
      expect(result.assets?.[0]?.buffer.byteLength).toBeGreaterThan(0);
      expect(content).toContain('./files/');
      expect(content).toContain('图片理解能力');
    }
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
