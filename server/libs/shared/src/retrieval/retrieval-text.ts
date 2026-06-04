export type RetrievalTextInput = {
  documentName?: string | null;
  retrievalHints?: readonly (string | null | undefined)[] | null;
  title?: string | null;
  content: string;
};

export const buildRetrievalText = (input: RetrievalTextInput) => {
  const parts = [
    input.documentName,
    ...(input.retrievalHints ?? []),
    input.title,
    input.content,
  ]
    .map((part) => normalizeRetrievalTextPart(part))
    .filter((part): part is string => Boolean(part));

  return [...new Set(parts)].join('\n');
};

export const buildAnswerContextText = (input: RetrievalTextInput) => {
  const parts = [input.documentName, input.title, input.content]
    .map((part) => normalizeRetrievalTextPart(part))
    .filter((part): part is string => Boolean(part));

  return [...new Set(parts)].join('\n');
};

const normalizeRetrievalTextPart = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  return normalized || null;
};
