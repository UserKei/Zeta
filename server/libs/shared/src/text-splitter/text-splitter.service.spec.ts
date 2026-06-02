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
});
