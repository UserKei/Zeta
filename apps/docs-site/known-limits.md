# 已知边界和后续计划

## 当前边界

1. **图片理解 Chunk 生成时机**

   上传预览阶段只展示 parser 生成的分段草稿。用户确认入库后，后端才调用视觉模型生成图片理解 Chunk，所以预览页不会立即出现图片理解分段。

2. **PDF 解析范围**

   系统优先支持文本 PDF。扫描件、复杂排版 PDF、字体映射异常 PDF 仍可能出现文本顺序错乱、字符异常或结构丢失。

3. **多模态能力范围**

   当前多模态方案保留图片资产，再由视觉模型生成文本 Chunk，最后进入文本检索链路。系统还没有实现图文向量混合检索。

4. **RAG 评测范围**

   评测脚本离线运行 Ragas / DeepEval，不接生产监控。评测结果用于汇报、对比和调参，不作为线上阻断条件。

5. **文档站部署路径**

   GitHub Pages 项目页默认使用 `/Zeta/` 作为 `VITEPRESS_BASE`。如果后续改仓库名、迁移到组织站点根路径或使用自定义域名，需要同步调整 GitHub Actions 中的 `VITEPRESS_BASE`。

## 后续计划

- PDF：评估 OCR fallback 或独立文档解析服务。
- 多模态：图片理解 Chunk 跑通后，再评估图片向量化和图文混合召回。
- 评测：继续扩展 GitLab Handbook 或中文企业制度语料，并维护 baseline。
- 检索：继续观察 document-level diversity、Rerank 和 topK 对 context precision / recall 的影响。

## 本轮明确不做

- 不接生产监控。
- 不把评测逻辑放进 NestJS。
- 不做 Zeta 前端内置评测页面。
- 不改变当前 Ragas 评分逻辑。
