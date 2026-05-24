import { Injectable } from '@nestjs/common';
import type { TextSplitOptions } from './text-splitter.types';

@Injectable()
export class TextSplitterService {
  split(content: string, options: TextSplitOptions) {
    const text = content.trim();

    if (!text) {
      return [];
    }

    if (text.length <= options.maxLength) {
      return [text];
    }

    const parts: string[] = [];
    let start = 0;

    while (start < text.length) {
      const hardEnd = Math.min(start + options.maxLength, text.length);

      if (hardEnd === text.length) {
        const tail = text.slice(start).trim();

        if (tail) {
          parts.push(tail);
        }

        break;
      }

      const splitAt = this.findSplitPoint(text, start, hardEnd);
      const part = text.slice(start, splitAt).trim();

      if (part) {
        parts.push(part);
      }

      start = splitAt;

      while (start < text.length && /\s/.test(text[start])) {
        start += 1;
      }
    }

    return parts;
  }

  private findSplitPoint(text: string, start: number, hardEnd: number) {
    const softStart = start + Math.floor((hardEnd - start) / 2);
    const punctuation = ['。', '.', '！', '!', '？', '?'];

    for (let index = hardEnd - 1; index > softStart; index -= 1) {
      if (punctuation.includes(text[index])) {
        return index + 1;
      }
    }

    for (let index = hardEnd - 1; index > softStart; index -= 1) {
      if (text[index] === '\n') {
        return index + 1;
      }
    }

    return hardEnd;
  }
}
