import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ChunkStatus } from '../../generated/prisma/enums';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
  FileParseResult,
} from '../core/parser.types';
import {
  getDocumentNameFromFileName,
  normalizeFileName,
} from '../core/parser.utils';

@Injectable()
export class SpreadsheetParserService implements DocumentFileParser {
  readonly sourceFormat = 'EXCEL' as const;

  supports(fileName: string, mimeType?: string | null) {
    const lowerFileName = fileName.toLowerCase();

    return (
      lowerFileName.endsWith('.csv') ||
      lowerFileName.endsWith('.xlsx') ||
      lowerFileName.endsWith('.xls') ||
      mimeType === 'text/csv' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  parse(input: FileParseInput, options: FileParseOptions): FileParseResult {
    const fileName = normalizeFileName(input.fileName);
    const documentName = getDocumentNameFromFileName(fileName);
    const sourceFormat = this.getSourceFormat(fileName, input.mimeType);
    const workbook = this.readWorkbook(input.buffer);
    const chunks = this.parseWorkbook(workbook, documentName, options);

    if (chunks.length === 0) {
      throw new BadRequestException('表格文件没有有效数据');
    }

    if (chunks.length > options.maxChunkCount) {
      throw new BadRequestException(
        `chunk count cannot exceed ${options.maxChunkCount}`,
      );
    }

    return {
      fileName,
      documentName,
      sourceFormat,
      chunks,
    };
  }

  private getSourceFormat(fileName: string, mimeType?: string | null) {
    const lowerFileName = fileName.toLowerCase();

    if (lowerFileName.endsWith('.csv') || mimeType === 'text/csv') {
      return 'CSV' as const;
    }

    return 'EXCEL' as const;
  }

  private readWorkbook(buffer: Buffer) {
    try {
      return XLSX.read(buffer, {
        type: 'buffer',
        raw: false,
        cellDates: false,
        dense: false,
        codepage: 65001,
      });
    } catch {
      throw new BadRequestException('表格文件解析失败');
    }
  }

  private parseWorkbook(
    workbook: XLSX.WorkBook,
    documentName: string,
    options: FileParseOptions,
  ) {
    const chunks: FileParseResult['chunks'] = [];
    const effectiveSheets = workbook.SheetNames.filter((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = this.getSheetRows(sheet);

      return rows.some((row) => this.hasEffectiveCell(row));
    });
    const shouldIncludeSheetName = effectiveSheets.length > 1;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = this.getSheetRows(sheet);
      const [headerRow, ...dataRows] = rows;

      if (!headerRow || !this.hasEffectiveCell(headerRow)) {
        continue;
      }

      const headers = this.normalizeHeaders(headerRow);

      for (const [rowIndex, row] of dataRows.entries()) {
        if (!this.hasEffectiveCell(row)) {
          continue;
        }

        const content = this.rowToContent(headers, row);

        if (!content) {
          continue;
        }

        if (content.length > options.maxChunkLength) {
          throw new BadRequestException(
            `chunk length cannot exceed ${options.maxChunkLength}`,
          );
        }

        chunks.push({
          title: this.createChunkTitle(
            documentName,
            shouldIncludeSheetName ? sheetName : null,
            rowIndex + 2,
          ),
          content,
          status: ChunkStatus.ACTIVE,
        });
      }
    }

    return chunks;
  }

  private getSheetRows(sheet: XLSX.WorkSheet): unknown[][] {
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown;

    if (!this.isUnknownArray(rows)) {
      return [];
    }

    return rows.map((row) => (this.isUnknownArray(row) ? [...row] : [row]));
  }

  private normalizeHeaders(row: readonly unknown[]): string[] {
    return row.map(
      (cell, index) => this.normalizeCell(cell) || `列${index + 1}`,
    );
  }

  private rowToContent(headers: string[], row: readonly unknown[]): string {
    const columnCount = Math.max(headers.length, row.length);
    const pairs: string[] = [];

    for (let index = 0; index < columnCount; index += 1) {
      const header = headers[index] || `列${index + 1}`;
      const value = this.normalizeCell(row[index]);

      if (!value) {
        continue;
      }

      pairs.push(`${header}: ${value}`);
    }

    return pairs.join('; ');
  }

  private createChunkTitle(
    documentName: string,
    sheetName: string | null,
    rowNumber: number,
  ): string {
    return [documentName, sheetName, `第 ${rowNumber} 行`]
      .filter(Boolean)
      .join(' / ');
  }

  private hasEffectiveCell(row: readonly unknown[]): boolean {
    return row.some((cell) => this.normalizeCell(cell).length > 0);
  }

  private normalizeCell(cell: unknown): string {
    if (cell === null || cell === undefined) {
      return '';
    }

    if (typeof cell === 'string') {
      return this.cleanCellText(cell);
    }

    if (
      typeof cell === 'number' ||
      typeof cell === 'boolean' ||
      typeof cell === 'bigint'
    ) {
      return this.cleanCellText(String(cell));
    }

    if (cell instanceof Date) {
      return this.cleanCellText(cell.toISOString());
    }

    if (this.isUnknownArray(cell)) {
      const values = cell
        .map((item) => this.normalizeCell(item))
        .filter((value) => value.length > 0);

      return this.cleanCellText(values.join(', '));
    }

    if (typeof cell === 'object') {
      return this.normalizeObjectCell(cell);
    }

    return '';
  }

  private normalizeObjectCell(cell: object): string {
    const record = cell as Record<string, unknown>;

    for (const key of ['w', 'text', 'v']) {
      const value = record[key];

      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        return this.cleanCellText(String(value));
      }
    }

    try {
      const serialized = JSON.stringify(cell);

      return serialized ? this.cleanCellText(serialized) : '';
    } catch {
      return '';
    }
  }

  private cleanCellText(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  private isUnknownArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
  }
}
