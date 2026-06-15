def create_ocr_engine(
    paddle_ocr_class,
    lang: str,
    *,
    ocr_version: str = "PP-OCRv4",
    detection_model_name: str = "PP-OCRv4_mobile_det",
    recognition_model_name: str = "PP-OCRv4_mobile_rec",
):
    lightweight_options = {
        "lang": lang,
        "ocr_version": ocr_version,
        "text_detection_model_name": detection_model_name,
        "text_recognition_model_name": recognition_model_name,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
    }

    try:
        return paddle_ocr_class(**lightweight_options)
    except (TypeError, ValueError):
        pass

    try:
        return paddle_ocr_class(use_angle_cls=True, lang=lang, show_log=False)
    except (TypeError, ValueError):
        return paddle_ocr_class(lang=lang)
