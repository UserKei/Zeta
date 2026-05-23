import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthUser, TokenPair } from '@zeta/common/user'

export const useUserStore = defineStore(
  'user',
  () => {
    const user = ref<AuthUser | null>(null)
    const token = ref<TokenPair | null>(null)

    const accessToken = computed(() => token.value?.accessToken ?? '')
    const refreshToken = computed(() => token.value?.refreshToken ?? '')
    const displayName = computed(
      () => user.value?.displayName || user.value?.username || '当前用户',
    )
    const isLoggedIn = computed(() => Boolean(accessToken.value))

    const setAuth = (nextUser: AuthUser, nextToken: TokenPair) => {
      user.value = nextUser
      token.value = nextToken
    }

    const updateUser = (nextUser: AuthUser) => {
      user.value = nextUser
    }

    const updateToken = (nextToken: TokenPair) => {
      token.value = nextToken
    }

    const logout = () => {
      user.value = null
      token.value = null
    }

    return {
      user,
      token,
      accessToken,
      refreshToken,
      displayName,
      isLoggedIn,
      setAuth,
      updateUser,
      updateToken,
      logout,
    }
  },
  {
    persist: true,
  },
)
