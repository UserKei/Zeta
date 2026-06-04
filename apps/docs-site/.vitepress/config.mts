import { Buffer } from 'node:buffer'
import { defineConfig } from 'vitepress'

const base = process.env.VITEPRESS_BASE ?? (process.env.GITHUB_ACTIONS ? '/Zeta/' : '/')

export default defineConfig({
  title: 'Zeta',
  description: 'AI 知识库管理平台交付文档',
  base,
  lastUpdated: true,
  srcExclude: ['public/eval-reports/**/*.md'],
  markdown: {
    config(md) {
      const defaultFence = md.renderer.rules.fence

      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const language = token.info.trim().split(/\s+/)[0]

        if (language === 'mermaid') {
          const encoded = Buffer.from(token.content, 'utf8').toString('base64')

          return `<MermaidDiagram code="${encoded}" />`
        }

        if (defaultFence) {
          return defaultFence(tokens, idx, options, env, self)
        }

        return self.renderToken(tokens, idx, options)
      }
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '项目介绍', link: '/' },
      { text: 'Demo', link: '/demo' },
      { text: 'RAG 评测', link: '/rag-evaluation' },
      { text: '报告索引', link: '/eval-reports/' },
    ],
    sidebar: [
      {
        text: '交付文档',
        items: [
          { text: '项目介绍', link: '/' },
          { text: 'Demo 演示', link: '/demo' },
          { text: '快速开始', link: '/quick-start' },
          { text: '系统架构', link: '/architecture' },
          { text: '文件解析链路', link: '/file-parsing' },
          { text: 'RAG 评测报告', link: '/rag-evaluation' },
          { text: '评测报告索引', link: '/eval-reports/' },
          { text: '边界与后续计划', link: '/known-limits' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/UserKei/Zeta' },
    ],
    footer: {
      message: 'Zeta project delivery documentation.',
      copyright: 'Released for course demo and project delivery.',
    },
    search: {
      provider: 'local',
    },
  },
})
