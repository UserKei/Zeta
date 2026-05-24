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
        component: () => import('@/views/KnowledgeBases/index.vue'),
      },
      {
        path: ':knowledgeBaseId/document',
        name: 'knowledge-documents',
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
        component: () => import('@/views/Paragraph/index.vue'),
      },
    ],
  },
]
