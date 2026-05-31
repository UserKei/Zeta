import Layout from '@/layout/index.vue'
import WorkspaceLayout from '@/layout/workspace/index.vue'
import { DataAnalysis, Document, Search, Setting } from '@element-plus/icons-vue'
import type { RouteLocation } from 'vue-router'

export default [
  {
    path: '/knowledge-bases',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index',
        name: 'knowledge-bases',
        meta: {
          requiresAuth: true,
          activeMenu: 'knowledge-bases',
          title: '知识库',
        },
        component: () => import('@/views/KnowledgeBases/index.vue'),
      },
      {
        path: ':knowledgeBaseId/document/upload',
        name: 'knowledge-document-upload',
        meta: {
          requiresAuth: true,
          activeMenu: 'knowledge-bases',
          title: '上传文档',
        },
        component: () => import('@/views/DocumentUpload/index.vue'),
      },
      {
        path: ':knowledgeBaseId',
        component: WorkspaceLayout,
        redirect: (to: RouteLocation) => ({
          name: 'knowledge-documents',
          params: to.params,
        }),
        meta: {
          requiresAuth: true,
          activeMenu: 'knowledge-bases',
          workspaceTitle: '知识库',
          workspaceSubtitle: '文档、分段与检索管理',
          workspaceBackRoute: 'knowledge-bases',
        },
        children: [
          {
            path: 'document',
            name: 'knowledge-documents',
            meta: {
              requiresAuth: true,
              activeMenu: 'knowledge-bases',
              workspaceMenu: true,
              title: '文档管理',
              icon: Document,
            },
            component: () => import('@/views/KnowledgeDocuments/index.vue'),
          },
          {
            path: 'retrieval',
            name: 'knowledge-retrieval',
            meta: {
              requiresAuth: true,
              activeMenu: 'knowledge-bases',
              workspaceMenu: true,
              title: '检索测试',
              icon: Search,
            },
            component: () => import('@/views/KnowledgeRetrieval/index.vue'),
          },
          {
            path: 'usage',
            name: 'knowledge-usage',
            meta: {
              requiresAuth: true,
              activeMenu: 'knowledge-bases',
              workspaceMenu: true,
              title: '知识热度',
              icon: DataAnalysis,
            },
            component: () => import('@/views/KnowledgeUsage/index.vue'),
          },
          {
            path: 'settings',
            name: 'knowledge-settings',
            meta: {
              requiresAuth: true,
              activeMenu: 'knowledge-bases',
              workspaceMenu: true,
              title: '知识库设置',
              icon: Setting,
            },
            component: () => import('@/views/KnowledgeSettings/index.vue'),
          },
        ],
      },
    ],
  },
  {
    path: '/paragraph',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: ':knowledgeBaseId/:documentId',
        name: 'paragraph',
        meta: {
          requiresAuth: true,
          activeMenu: 'knowledge-bases',
          title: '分段',
        },
        component: () => import('@/views/Paragraph/index.vue'),
      },
    ],
  },
]
