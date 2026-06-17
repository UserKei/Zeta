import Layout from '@/layout/index.vue'
import { loadModelsView } from '@/router/view-loaders'

export default [
  {
    path: '/models',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index',
        name: 'models',
        meta: {
          requiresAuth: true,
          activeMenu: 'models',
          title: '模型管理',
          breadcrumb: [{ label: '模型管理' }],
        },
        component: loadModelsView,
      },
    ],
  },
]
