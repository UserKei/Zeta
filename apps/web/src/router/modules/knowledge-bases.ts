import Layout from '@/layout/index.vue'
import WorkspaceLayout from '@/layout/workspace/index.vue'
import {
  ChartNoAxesColumnIncreasingIcon,
  FileTextIcon,
  SearchIcon,
  SettingsIcon,
} from '@lucide/vue'
import type { RouteLocation, RouteLocationNormalizedLoaded } from 'vue-router'

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
          breadcrumb: [{ label: '知识库' }],
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
          breadcrumb: [
            { label: '知识库', to: { name: 'knowledge-bases' } },
            {
              label: '文档管理',
              to: (route: RouteLocationNormalizedLoaded) => ({
                name: 'knowledge-documents',
                params: { knowledgeBaseId: route.params.knowledgeBaseId },
              }),
            },
            { label: '上传文档' },
          ],
          breadcrumbBack: (route: RouteLocationNormalizedLoaded) => ({
            name: 'knowledge-documents',
            params: { knowledgeBaseId: route.params.knowledgeBaseId },
          }),
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
              icon: FileTextIcon,
              breadcrumb: [
                { label: '知识库', to: { name: 'knowledge-bases' } },
                { label: '文档管理' },
              ],
              breadcrumbBack: { name: 'knowledge-bases' },
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
              icon: SearchIcon,
              breadcrumb: [
                { label: '知识库', to: { name: 'knowledge-bases' } },
                { label: '检索测试' },
              ],
              breadcrumbBack: { name: 'knowledge-bases' },
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
              icon: ChartNoAxesColumnIncreasingIcon,
              breadcrumb: [
                { label: '知识库', to: { name: 'knowledge-bases' } },
                { label: '知识热度' },
              ],
              breadcrumbBack: { name: 'knowledge-bases' },
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
              icon: SettingsIcon,
              breadcrumb: [
                { label: '知识库', to: { name: 'knowledge-bases' } },
                { label: '知识库设置' },
              ],
              breadcrumbBack: { name: 'knowledge-bases' },
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
          breadcrumb: [
            { label: '知识库', to: { name: 'knowledge-bases' } },
            {
              label: '文档管理',
              to: (route: RouteLocationNormalizedLoaded) => ({
                name: 'knowledge-documents',
                params: { knowledgeBaseId: route.params.knowledgeBaseId },
              }),
            },
            { label: '分段' },
          ],
          breadcrumbBack: (route: RouteLocationNormalizedLoaded) => ({
            name: 'knowledge-documents',
            params: { knowledgeBaseId: route.params.knowledgeBaseId },
          }),
        },
        component: () => import('@/views/Paragraph/index.vue'),
      },
    ],
  },
]
