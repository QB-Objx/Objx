import { closePool, runtime } from './runtime.mjs';

async function main() {
  const handle = runtime.startEventDispatcher(
    async (event) => {
      console.log('dispatching event', event);
      if (event && typeof event === 'object' && 'id' in event && typeof event.id === 'number') {
        await runtime.events.ack(event.id);
      }
    },
    { batchSize: 100, intervalMs: 1000 },
  );

  process.on('SIGINT', () => handle.stop());
  process.on('SIGTERM', () => handle.stop());

  await handle.done;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
