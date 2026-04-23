import { closePool, runtime } from './runtime.mjs';

async function main() {
  const handle = runtime.startQueueWorker(
    async (job) => {
      console.log('processing job', job);
      if (job && typeof job === 'object' && 'id' in job && typeof job.id === 'number') {
        await runtime.queue.complete(job.id);
      }
    },
    { workerId: 'example-worker', intervalMs: 1000 },
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
