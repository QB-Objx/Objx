import { closePool, runtime } from './runtime.mjs';

async function main() {
  await runtime.provisionInternalSchema({
    pluginName: 'postgres-specialist-runtime-example',
    version: '1',
  });

  await runtime.queue.enqueue({
    queueName: 'default',
    jobName: 'email.send-welcome',
    payload: { userId: 'u_100' },
  });

  await runtime.events.publish({
    eventName: 'user.created',
    payload: { userId: 'u_100', email: 'u100@example.com' },
    aggregateId: 'u_100',
    aggregateType: 'user',
    idempotencyKey: 'user.created:u_100',
  });

  const summary = await runtime.cache.getOrCompute(
    'user:summary:u_100',
    async () => ({ id: 'u_100', name: 'User 100' }),
    { tags: ['user', 'summary'] },
  );

  console.log('summary', summary);
  console.log('metrics', runtime.metrics());
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
