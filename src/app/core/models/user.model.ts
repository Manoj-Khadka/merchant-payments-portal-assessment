export type Role = 'SALES' | 'REVIEWER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType?: 'Bearer';
}

export interface AuthResponse extends Tokens {
  refreshToken: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}
