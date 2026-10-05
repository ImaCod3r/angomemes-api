import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { GoogleProfile, GoogleVerifier } from './GoogleVerifier.js';

export class GoogleAuthVerifier implements GoogleVerifier {
  private readonly client = new OAuth2Client();
  private readonly clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async verify(idToken: string): Promise<GoogleProfile | null> {
    let payload: TokenPayload | undefined;
    try {
      // Verifica assinatura, expiração, emissor e `aud` igual ao Client ID.
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      return null;
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0]!,
      avatarUrl: payload.picture ?? null,
    };
  }
}
