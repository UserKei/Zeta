# PDF / DOCX 导入样例生成说明

当前仓库不直接提交二进制 PDF / DOCX 样例文件。需要验证 PDF / DOCX 导入时，可以用下面方式快速生成测试文件：

1. 打开 `docs/demo/it-account-onboarding.md`、`docs/demo/procurement-contract-approval.md` 或 `docs/demo/security-incident-response.md`。
2. 使用本地编辑器、Typora、飞书文档或浏览器打印功能导出为 PDF。
3. 使用 Word、WPS 或飞书文档另存为 `.docx`。
4. 在 Zeta 上传页选择“文本文件”，上传生成的 `.pdf` 或 `.docx`。

注意事项：

- PDF 首版只支持文本型 PDF，也就是内容可以被选中和复制的文件。
- 扫描件、图片型 PDF 暂不支持，后续会进入 OCR / 多模态处理阶段。
- DOCX 首版只提取正文文本，不处理复杂图表、批注、页眉页脚。

推荐测试问题：

- `VPN 权限多久生效？`
- `采购合同超过 100 万需要哪些审批？`
- `发现钓鱼邮件应该多久内上报？`
