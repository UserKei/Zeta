# 已知边界和后续计划

## 当前边界

1. **图片理解 Chunk 的生成时机**

   上传预览阶段只展示 parser 直接生成的分段草稿。图片理解 Chunk 会在确认入库后生成，所以开启视觉模型后，预览页不会马上出现额外图片理解分段。

2. **PDF 解析稳定性**

   当前优先支持文本 PDF。扫描件、复杂排版 PDF、字体映射异常 PDF 仍可能出现文本顺序错乱、字符异常或结构丢失。

3. **多模态能力范围**

   当前多模态方案是“图片资产保留 + 视觉模型生成文本 Chunk + 文本检索消费”，不是完整的图文向量检索。

4. **RAG 评测范围**

   当前评测是离线 Ragas 流程，不是生产监控。评测结果用于汇报、对比和调参，不作为线上阻断条件。

## 后续计划

- PDF：评估 OCR fallback 或独立文档解析服务。
- 多模态：在图片理解 Chunk 稳定后，再评估图片向量化和图文混合召回。
- 评测：继续扩展 GitLab Handbook 或中文企业制度语料，并维护 baseline。
- 文档站：把 DeepEval JSON 转成 Markdown 页面发布，不接 Confident AI 云 dashboard。
- 检索：继续观察 document-level diversity、Rerank 和 topK 对 context precision / recall 的影响。

## 本轮明确不做

- 不接生产监控。
- 不把评测逻辑放进 NestJS。
- 不做 Zeta 前端内置评测页面。
- 不改变当前 Ragas 评分逻辑。
