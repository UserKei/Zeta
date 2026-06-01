# 多模态测试素材

这个目录保存用于验证“图片资产保留 + 图片理解 Chunk”的 demo 媒体素材。

## 使用方式

1. 使用 `approval-flow.md` 和 `risk-rules.md` 作为生成文档的底稿。
2. 将 Markdown 导出为 PDF 或 DOCX，确保图片仍保留在文档中。
3. 上传导出的 PDF / DOCX 到 Zeta。
4. 配置视觉模型后，检查是否生成“图片理解”分段。

## 推荐验证点

- `approval-flow.md`：建议导出为 PDF，验证 PDF 页面图生成图片理解 Chunk。
- `risk-rules.md`：建议导出为 DOCX，验证 DOCX 图片资产和图片理解 Chunk。
- `approval-materials.mmd`：当前只作为草稿保留，不作为本轮推荐演示素材。

注意：文档正文里尽量不要重复写图片中的全部文字，否则无法证明检索命中来自图片理解 Chunk。
