import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { PushSubscription } from '../../src/db/index.js';
import { migrator } from '../../src/db/migrator.js';
import { FakeGoogleVerifier } from '../../src/services/google/FakeGoogleVerifier.js';
import { InMemoryStorageService } from '../../src/services/storage/InMemoryStorageService.js';

const app = createApp({
  googleVerifier: new FakeGoogleVerifier(),
  storage: new InMemoryStorageService(),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('notificações push', () => {
  it('regista uma subscrição anónima', async () => {
    const upsert = vi.spyOn(PushSubscription, 'upsert').mockResolvedValue(PushSubscription.build());
    const subscription = {
      endpoint: 'https://push.example.test/subscription',
      keys: { p256dh: 'public-key', auth: 'auth-key' },
    };

    const res = await request(app).post('/notifications/push-subscriptions').send(subscription);

    expect(res.status).toBe(204);
    expect(upsert).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
  });

  it('recusa uma subscrição inválida sem chamar a base de dados', async () => {
    const upsert = vi.spyOn(PushSubscription, 'upsert');

    const res = await request(app).post('/notifications/push-subscriptions').send({
      endpoint: 'não-é-um-url',
      keys: { p256dh: '', auth: '' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('remove a subscrição pelo endpoint, sem depender da conta', async () => {
    const destroy = vi.spyOn(PushSubscription, 'destroy').mockResolvedValue(1);
    const endpoint = 'https://push.example.test/device';

    const res = await request(app)
      .delete('/notifications/push-subscriptions')
      .send({ endpoint });

    expect(res.status).toBe(204);
    expect(destroy).toHaveBeenCalledWith({ where: { endpoint } });
  });

  it('identifica o dispositivo apenas pelo endpoint', () => {
    expect(PushSubscription.getAttributes().userId).toBeUndefined();
  });

  it('inclui a migração da tabela de subscrições', async () => {
    const migrations = await migrator.migrations();

    expect(migrations.map(({ name }) => name)).toContain('0015-create-push-subscriptions');
    expect(migrations.map(({ name }) => name)).toContain('0016-remove-push-subscription-user');
  });
});
