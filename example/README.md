# Example Corpora

`example/` is for local demo and evaluation corpora. The import scripts can clone
public Markdown repositories into `example/corpora/`, but the corpus checkout
itself is not committed.

Default RAG evaluation corpus:

```bash
pnpm import:markdown-corpus
```

Useful smoke run:

```bash
CORPUS_LIMIT=5 pnpm import:markdown-corpus
```

The default preset imports the GitLab Handbook and automatically creates or
reuses these evaluation resources:

- `GitLab Handbook Chat` chat model
- `GitLab Handbook Embedding` embedding model
- `GitLab Handbook` knowledge base
- `GitLab Handbook Expert` Agent

The script uses `DASHSCOPE_API_KEY` from `.env` to initialize the default
Aliyun Bailian model configs. Advanced runs can override stable resource ids
with `CORPUS_CHAT_MODEL_ID`, `CORPUS_EMBEDDING_MODEL_ID`, `CORPUS_KB_ID`, and
`CORPUS_AGENT_ID`, but they are not required for the default workflow.
