import { TextSplitterService } from './text-splitter.service';

describe('TextSplitterService', () => {
  const service = new TextSplitterService();

  it('reuses the configured overlap between adjacent chunks', () => {
    const chunks = service.split('abcdefghij', {
      maxLength: 5,
      overlapLength: 2,
    });

    expect(chunks).toEqual(['abcde', 'defgh', 'ghij']);
  });

  it('prefers Chinese punctuation as a soft split point', () => {
    const chunks = service.split(
      '第一句内容很长啊。第二句内容很长。第三句内容',
      {
        maxLength: 12,
        overlapLength: 0,
      },
    );

    expect(chunks[0]).toBe('第一句内容很长啊。');
    expect(chunks.every((chunk) => chunk.length <= 12)).toBe(true);
  });

  it('uses newlines as a soft split point when punctuation is unavailable', () => {
    const chunks = service.split('第一段内容很长\n第二段内容很长很长\n第三段', {
      maxLength: 12,
      overlapLength: 0,
    });

    expect(chunks[0]).toBe('第一段内容很长');
    expect(chunks.every((chunk) => chunk.length <= 12)).toBe(true);
  });

  it('returns an empty array for blank content', () => {
    expect(
      service.split('   \n  \t ', {
        maxLength: 10,
        overlapLength: 0,
      }),
    ).toEqual([]);
  });

  it('rejects invalid length options', () => {
    expect(() =>
      service.split('正文', {
        maxLength: 0,
        overlapLength: 0,
      }),
    ).toThrow('maxLength must be positive');
    expect(() =>
      service.split('正文', {
        maxLength: 10,
        overlapLength: 10,
      }),
    ).toThrow('overlapLength must be smaller than maxLength');
  });

  it('continues making progress when overlap is close to max length', () => {
    const chunks = service.split('abcdefghijklmnop', {
      maxLength: 5,
      overlapLength: 4,
    });

    expect(chunks.at(-1)).toBe('lmnop');
    expect(chunks.every((chunk) => chunk.length <= 5)).toBe(true);
    expect(chunks.length).toBeLessThan(20);
  });
});
