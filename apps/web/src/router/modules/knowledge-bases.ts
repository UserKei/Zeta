import Layout from '@/layout/index.vue'

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
        path: ':knowledgeBaseId/document',
        name: 'knowledge-documents',
        meta: {
          requiresAuth: true,
          activeMenu: 'knowledge-bases',
          title: '文档',
        },
        component: () => import('@/views/KnowledgeDocuments/index.vue'),
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
