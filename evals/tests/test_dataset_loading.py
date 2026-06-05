import json
import tempfile
import unittest
from pathlib import Path

from evals.ragas.run_ragas import load_cases


class DatasetLoadingTest(unittest.TestCase):
    def test_load_cases_reads_jsonl_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dataset.jsonl"
            path.write_text(
                json.dumps(
                    {
                        "id": "case-1",
                        "question": "VPN 权限多久生效？",
                        "reference": "审批通过后通常 15 分钟内生效。",
                        "expected_documents": ["IT 服务台 FAQ"],
                        "top_k": 3,
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )

            cases = load_cases(path)

        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0].case_id, "case-1")
        self.assertEqual(cases[0].top_k, 3)
        self.assertEqual(cases[0].expected_documents, ["IT 服务台 FAQ"])

    def test_load_cases_accepts_explicit_case_id_and_top_k_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dataset.jsonl"
            path.write_text(
                json.dumps(
                    {
                        "case_id": "case-alias",
                        "question": "VPN 权限多久生效？",
                        "reference": "审批通过后通常 15 分钟内生效。",
                        "expected_documents": ["IT 服务台 FAQ"],
                        "topK": 8,
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )

            cases = load_cases(path)

        self.assertEqual(cases[0].case_id, "case-alias")
        self.assertEqual(cases[0].top_k, 8)


if __name__ == "__main__":
    unittest.main()
