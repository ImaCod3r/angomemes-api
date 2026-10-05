export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface GoogleVerifier {
  /** Devolve o perfil se o ID token for válido, ou null se não for. */
  verify(idToken: string): Promise<GoogleProfile | null>;
}
