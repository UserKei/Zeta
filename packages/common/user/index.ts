export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type RefreshTokenPayload = {
  refreshToken: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthRequestUser = Pick<AuthUser, 'id' | 'username'>;

export type AuthTokenClaims = {
  sub: string;
  username: string;
  tokenType: 'access' | 'refresh';
};

export type AuthTokenPayload = AuthTokenClaims & {
  iat?: number;
  exp?: number;
};
