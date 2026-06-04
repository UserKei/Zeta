import json
import tempfile
import unittest
from pathlib import Path

from evals.ragas.run_ragas import read_evaluation_baseline


class BaselineLoadingTest(unittest.TestCase):
    def test_reads_named_metric_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "baseline.json"
            path.write_text(
                json.dumps(
                    {
                        "name": "gitlab-handbook-30-case",
                        "metrics": {
                            "faithfulness": 0.92,
                            "context_recall": 0.86,
                        },
                    }
                ),
                encoding="utf-8",
            )

            baseline = read_evaluation_baseline(path)

        self.assertEqual(baseline.name, "gitlab-handbook-30-case")
        self.assertEqual(
            baseline.metrics,
            {
                "faithfulness": 0.92,
                "context_recall": 0.86,
            },
        )

    def test_missing_baseline_is_optional(self):
        baseline = read_evaluation_baseline(Path("missing-baseline.json"))

        self.assertIsNone(baseline)

    def test_rejects_invalid_metric_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "baseline.json"
            path.write_text(
                json.dumps(
                    {
                        "name": "bad-baseline",
                        "metrics": {
                            "faithfulness": "high",
                        },
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "metrics"):
                read_evaluation_baseline(path)


if __name__ == "__main__":
    unittest.main()
