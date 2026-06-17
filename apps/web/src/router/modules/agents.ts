import Layout from '@/layout/index.vue'
import WorkspaceLayout from '@/layout/workspace/index.vue'
import { MessageCircleIcon, SettingsIcon } from '@lucide/vue'
import type { RouteLocation } from 'vue-router'
import { loadAgentChatLogsView, loadAgentSettingsView, loadAgentsView } from '@/router/view-loaders'

export default [
  {
    path: '/agents',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index',
        name: 'agents',
        meta: {
          requiresAuth: true,
          activeMenu: 'agents',
          title: '专家 Agent',
          breadcrumb: [{ label: '专家 Agent' }],
        },
        component: loadAgentsView,
      },
      {
        path: ':agentId',
        component: WorkspaceLayout,
        redirect: (to: RouteLocation) => ({
          name: 'agent-settings',
          params: to.params,
        }),
        meta: {
          requiresAuth: true,
          activeMenu: 'agents',
        },
        children: [
          {
            path: 'settings',
            name: 'agent-settings',
            meta: {
              requiresAuth: true,
              activeMenu: 'agents',
              workspaceMenu: true,
              title: '设置',
              icon: SettingsIcon,
              preload: loadAgentSettingsView,
              breadcrumb: [{ label: '专家 Agent', to: { name: 'agents' } }, { label: '设置' }],
              breadcrumbBack: { name: 'agents' },
            },
            component: loadAgentSettingsView,
          },
          {
            path: 'chat-logs',
            name: 'agent-chat-logs',
            meta: {
              requiresAuth: true,
              activeMenu: 'agents',
              workspaceMenu: true,
              title: '对话日志',
              icon: MessageCircleIcon,
              preload: loadAgentChatLogsView,
              breadcrumb: [{ label: '专家 Agent', to: { name: 'agents' } }, { label: '对话日志' }],
              breadcrumbBack: { name: 'agents' },
            },
            component: loadAgentChatLogsView,
          },
        ],
      },
    ],
  },
]
