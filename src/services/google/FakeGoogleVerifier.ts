import type { GoogleProfile, GoogleVerifier } from './GoogleVerifier.js';

/** Versão em memória para testes: só aceita os tokens registados. */
export class FakeGoogleVerifier implements GoogleVerifier {
  private readonly profiles = new Map<string, GoogleProfile>();

  register(idToken: string, profile: GoogleProfile) {
    this.profiles.set(idToken, profile);
  }

  async verify(idToken: string): Promise<GoogleProfile | null> {
    return this.profiles.get(idToken) ?? null;
  }
}
