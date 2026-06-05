import { defineConfig } from 'vitepress'

const base = process.env.VITEPRESS_BASE ?? (process.env.GITHUB_ACTIONS ? '/Zeta/' : '/')

export default defineConfig({
  lang: 'zh-CN',
  title: 'Zeta',
  description: 'AI 知识库管理平台交付文档',
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['public/eval-reports/**/*.md'],
  themeConfig: {
    outline: {
      label: '本页目录',
    },
    nav: [
      { text: '项目介绍', link: '/' },
      { text: 'Demo', link: '/demo' },
      { text: 'RAG 评测', link: '/rag-evaluation' },
      { text: '报告', link: '/eval-reports/' },
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
          { text: '评测报告', link: '/eval-reports/' },
          { text: '边界与后续计划', link: '/known-limits' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/UserKei/Zeta' },
    ],
    footer: {
      message: 'Zeta 项目交付文档。',
      copyright: '用于课程演示与项目交付。',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
        forceLocale: true,
      },
    },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    langMenuLabel: '切换语言',
    skipToContentLabel: '跳到正文',
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '重置搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc',
                },
              },
            },
          },
        },
      },
    },
  },
})
