import unittest

from app.ocr_result import collect_ocr_lines


class OcrResultTest(unittest.TestCase):
    def test_collects_text_from_legacy_and_modern_paddleocr_results(self):
        result = [
            [
                [[0, 0], [10, 0], [10, 10], [0, 10]],
                ["采购合同", 0.98],
            ],
            {
                "rec_texts": ["风险等级", "审批人"],
            },
        ]

        self.assertEqual(
            collect_ocr_lines(result),
            ["采购合同", "风险等级", "审批人"],
        )

    def test_removes_blank_and_adjacent_duplicate_lines(self):
        result = {
            "rec_texts": ["高风险", " ", "高风险", "审批通过"],
        }

        self.assertEqual(
            collect_ocr_lines(result),
            ["高风险", "审批通过"],
        )


if __name__ == "__main__":
    unittest.main()
