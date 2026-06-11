import unittest

from app.ocr_engine import create_ocr_engine


class OcrEngineTest(unittest.TestCase):
    def test_uses_lightweight_mobile_models_by_default(self):
        calls = []

        class FakePaddleOCR:
            def __init__(self, **kwargs):
                calls.append(kwargs)

        engine = create_ocr_engine(FakePaddleOCR, "ch")

        self.assertIsInstance(engine, FakePaddleOCR)
        self.assertEqual(
            calls,
            [
                {
                    "lang": "ch",
                    "ocr_version": "PP-OCRv4",
                    "text_detection_model_name": "PP-OCRv4_mobile_det",
                    "text_recognition_model_name": "PP-OCRv4_mobile_rec",
                    "use_doc_orientation_classify": False,
                    "use_doc_unwarping": False,
                    "use_textline_orientation": False,
                },
            ],
        )

    def test_falls_back_when_paddleocr_rejects_new_and_legacy_options(self):
        calls = []

        class FakePaddleOCR:
            def __init__(self, **kwargs):
                calls.append(kwargs)

                if "text_detection_model_name" in kwargs:
                    raise ValueError("Unknown argument: text_detection_model_name")

                if "show_log" in kwargs:
                    raise ValueError("Unknown argument: show_log")

        engine = create_ocr_engine(FakePaddleOCR, "ch")

        self.assertIsInstance(engine, FakePaddleOCR)
        self.assertEqual(calls[-1], {"lang": "ch"})


if __name__ == "__main__":
    unittest.main()
