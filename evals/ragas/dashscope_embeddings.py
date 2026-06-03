from __future__ import annotations

from typing import Any

from langchain_core.embeddings import Embeddings

DEFAULT_DASHSCOPE_API_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"


class DashScopeTextEmbeddings(Embeddings):
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = DEFAULT_DASHSCOPE_API_BASE_URL,
        batch_size: int = 16,
        timeout: int = 120,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size
        self.timeout = timeout

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        embeddings: list[list[float]] = []

        for start in range(0, len(texts), self.batch_size):
            embeddings.extend(self.embed_batch(texts[start : start + self.batch_size]))

        return embeddings

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        try:
            import requests
        except ImportError as cause:
            raise RuntimeError(
                "Python package `requests` is required. "
                "Run `pip install -r evals/requirements.txt` first."
            ) from cause

        response = requests.post(
            f"{self.base_url}/services/embeddings/text-embedding/text-embedding",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "input": {"texts": texts},
            },
            timeout=self.timeout,
        )
        response.raise_for_status()

        return parse_dashscope_embedding_response(response.json(), len(texts))


def parse_dashscope_embedding_response(
    payload: dict[str, Any],
    expected_count: int,
) -> list[list[float]]:
    output = payload.get("output")

    if not isinstance(output, dict):
        raise RuntimeError("DashScope embedding response missing `output`")

    items = output.get("embeddings")

    if not isinstance(items, list):
        raise RuntimeError("DashScope embedding response missing `output.embeddings`")

    if all(isinstance(item, dict) and isinstance(item.get("text_index"), int) for item in items):
        items = sorted(items, key=lambda item: item["text_index"])

    embeddings: list[list[float]] = []

    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("embedding"), list):
            raise RuntimeError("DashScope embedding response contains invalid item")

        embeddings.append([float(value) for value in item["embedding"]])

    if len(embeddings) != expected_count:
        raise RuntimeError(
            "DashScope embedding response count does not match request count"
        )

    return embeddings
