import unittest
from unittest.mock import patch

from evals.ragas.dashscope_embeddings import (
    DashScopeTextEmbeddings,
    parse_dashscope_embedding_response,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class DashScopeTextEmbeddingsTest(unittest.TestCase):
    def test_embed_documents_calls_dashscope_native_api(self):
        payload = {
            "output": {
                "embeddings": [
                    {"text_index": 1, "embedding": [0.3, 0.4]},
                    {"text_index": 0, "embedding": [0.1, 0.2]},
                ]
            }
        }

        with patch("requests.post", return_value=FakeResponse(payload)) as post:
            embeddings = DashScopeTextEmbeddings(
                api_key="sk-test",
                model="text-embedding-v4",
            ).embed_documents(["first", "second"])

        self.assertEqual(embeddings, [[0.1, 0.2], [0.3, 0.4]])
        post.assert_called_once()
        _, kwargs = post.call_args
        self.assertEqual(
            post.call_args.args[0],
            "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
        )
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer sk-test")
        self.assertEqual(
            kwargs["json"],
            {
                "model": "text-embedding-v4",
                "input": {"texts": ["first", "second"]},
            },
        )

    def test_embed_documents_returns_empty_without_request(self):
        with patch("requests.post") as post:
            embeddings = DashScopeTextEmbeddings(
                api_key="sk-test",
                model="text-embedding-v4",
            ).embed_documents([])

        self.assertEqual(embeddings, [])
        post.assert_not_called()

    def test_parse_response_rejects_count_mismatch(self):
        with self.assertRaisesRegex(RuntimeError, "count"):
            parse_dashscope_embedding_response(
                {"output": {"embeddings": [{"embedding": [0.1]}]}},
                expected_count=2,
            )


if __name__ == "__main__":
    unittest.main()
