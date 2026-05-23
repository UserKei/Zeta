import { responseData, serverApi, type Response } from '..'
import type { AuthUser, TokenPair } from '@zeta/common/user'

export type LoginResult = {
  user: AuthUser
  token: TokenPair
}

export const login = (username: string, password: string) =>
  responseData(
    serverApi.post('/user/login', { username, password }) as Promise<
      Response<LoginResult>
    >,
  )

export const getCurrentUser = () =>
  responseData(serverApi.get('/user/me') as Promise<Response<AuthUser>>)
