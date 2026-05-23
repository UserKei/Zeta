import type { AuthUser, TokenPair } from '@zeta/common/user'

export type { AuthUser, TokenPair } from '@zeta/common/user'

const ACCESS_TOKEN_KEY = 'zeta.accessToken'
const REFRESH_TOKEN_KEY = 'zeta.refreshToken'
const USER_KEY = 'zeta.user'

export const hasAccessToken = () => Boolean(localStorage.getItem(ACCESS_TOKEN_KEY))

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

export const getStoredUser = () => {
  const user = localStorage.getItem(USER_KEY)

  return user ? (JSON.parse(user) as AuthUser) : null
}

export const saveAuth = (user: AuthUser, token: TokenPair) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  saveToken(token)
}

export const saveToken = (token: TokenPair) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token.accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, token.refreshToken)
}

export const clearAuth = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
