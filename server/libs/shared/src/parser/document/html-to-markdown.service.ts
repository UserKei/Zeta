import { Injectable } from '@nestjs/common';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { normalizeTextContent } from '../core/parser.utils';

@Injectable()
export class HtmlToMarkdownService {
  private readonly turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  constructor() {
    this.turndown.use(gfm);
    this.turndown.remove(['script', 'style']);
    this.turndown.addRule('mammothHeadingParagraph', {
      filter: (node) =>
        node.nodeName === 'P' &&
        Array.from(node.childNodes).some(
          (child) =>
            this.isElementNode(child) &&
            child.nodeName === 'A' &&
            /^heading_\d+$/i.test(child.getAttribute('id') ?? ''),
        ) &&
        Array.from(node.childNodes).some(
          (child) => child.nodeName === 'STRONG',
        ),
      replacement: (_content, node) => {
        const title = node.textContent?.trim();

        return title ? `\n\n## ${title}\n\n` : '\n\n';
      },
    });
    this.turndown.addRule('internalAnchor', {
      filter: (node) =>
        node.nodeName === 'A' &&
        (node.getAttribute('href')?.startsWith('#') ||
          /^heading_\d+$/i.test(node.getAttribute('id') ?? '')),
      replacement: (content) => content,
    });
    this.turndown.addRule('zetaTableCell', {
      filter: ['td', 'th'],
      replacement: (content, node) => this.tableCell(content, node),
    });
    this.turndown.addRule('zetaTableRow', {
      filter: 'tr',
      replacement: (content, node) => {
        if (this.isFirstTableRow(node)) {
          const separator = Array.from(node.childNodes)
            .filter((child): child is HTMLElement =>
              ['TD', 'TH'].includes(child.nodeName),
            )
            .map((child, index) => this.tableCell('---', child, index))
            .join('');

          return `\n${content}\n${separator}`;
        }

        return `\n${content}`;
      },
    });
    this.turndown.addRule('zetaTableSection', {
      filter: ['thead', 'tbody', 'tfoot'],
      replacement: (content) => content,
    });
    this.turndown.addRule('zetaTable', {
      filter: 'table',
      replacement: (content) => `\n\n${content.replace(/\n\n/g, '\n')}\n\n`,
    });
  }

  toMarkdown(html: string) {
    return normalizeTextContent(
      this.turndown
        .turndown(html)
        .replace(/^([*-]) {2,}/gm, '$1 ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n'),
    );
  }

  private tableCell(content: string, node: HTMLElement, index?: number) {
    const cellIndex =
      index ??
      Array.from(node.parentNode?.childNodes ?? [])
        .filter((child): child is HTMLElement =>
          ['TD', 'TH'].includes(child.nodeName),
        )
        .indexOf(node);
    const prefix = cellIndex === 0 ? '| ' : ' ';

    return `${prefix}${content.trim().replace(/\n+/g, '<br>')} |`;
  }

  private isFirstTableRow(node: HTMLElement) {
    const parent = node.parentNode;

    if (!parent) {
      return false;
    }

    const rows = Array.from(parent.childNodes).filter(
      (child) => child.nodeName === 'TR',
    );

    return rows[0] === node;
  }

  private isElementNode(node: ChildNode): node is HTMLElement {
    return typeof (node as HTMLElement).getAttribute === 'function';
  }
}
