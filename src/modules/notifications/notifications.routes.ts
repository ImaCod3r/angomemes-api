import { Router } from 'express';
import { z } from 'zod';
import { PushSubscription } from '../../db/index.js';

const subscriptionBody = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export function createNotificationsRouter() {
  const router = Router();

  router.post('/push-subscriptions', async (req, res) => {
    const body = subscriptionBody.parse(req.body);
    await PushSubscription.upsert({
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    res.status(204).end();
  });

  router.delete('/push-subscriptions', async (req, res) => {
    const body = z.object({ endpoint: z.url().max(2048) }).parse(req.body);
    await PushSubscription.destroy({
      where: { endpoint: body.endpoint },
    });
    res.status(204).end();
  });

  return router;
}
