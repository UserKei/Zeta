# 文件解析链路

多格式导入会先按文件类型保留标题、表格、图片引用等结构信息，再进入统一的 Chunk、全文索引和 Embedding 流程。

## 总体流程

上传文件后，后端会按文件类型选择 Parser，先生成分段草稿给前端预览；确认入库后再创建 Chunk、刷新全文索引、重建 Embedding，并更新文档状态与统计。

## 处理方式

| 格式           | 处理方式                                          | 取舍                                             |
| -------------- | ------------------------------------------------- | ------------------------------------------------ |
| Markdown / TXT | Markdown 按标题结构分段，TXT 按长度和标点兜底切分 | 适合普通文档和手写知识                           |
| HTML / DOCX    | 先转成 Markdown，再复用 Markdown 分段能力         | 复用一套分段逻辑，保留标题、列表、表格和图片引用 |
| CSV / Excel    | 第一行作为表头，后续每行一个 Chunk                | 适合审批矩阵、FAQ 表、权限清单等业务表格         |
| PDF            | 文本 PDF 使用 `pdfjs-dist` 抽取文本并推断结构     | 先覆盖文本 PDF，复杂 PDF 需要 OCR 或视觉理解队列 |

## Markdown / TXT

![Markdown 文件解析流程](/images/file-parsing/markdown-parser-flow.png)

---

![TXT 文件解析流程](/images/file-parsing/text-parser-flow.png)

Markdown 优先保留标题层级；TXT 没有结构信息，所以用长度和标点做兜底切分。

## HTML / DOCX

![HTML 文件解析流程](/images/file-parsing/html-parser-flow.png)

---

![DOCX 文件解析流程](/images/file-parsing/docx-parser-flow.png)

HTML 和 DOCX 都先进入 Markdown 链路，避免分别维护两套分段规则。DOCX 图片会作为资产保存，Markdown 中保留图片引用。

## CSV / Excel

![CSV、XLS、XLSX 文件解析流程](/images/file-parsing/spreadsheet-parser-flow.png)

表格文件更适合按行入库。每个 Chunk 会带上表头语义，方便检索“限额、审批人、生效时间”这类业务问题。

## PDF

![PDF 文件解析流程](/images/file-parsing/pdf-parser-flow.png)

PDF 解析仍有明确限制。文本 PDF 可以抽取内容并恢复部分结构；扫描件、复杂合同、公文和字体映射异常的 PDF 仍可能出现文字顺序错乱、字符异常或标题还原不稳定。

当前策略先覆盖文本 PDF。图中的 OCR fallback 和视觉理解队列属于后续方向，不属于已完成的 PDF 入库流程。
