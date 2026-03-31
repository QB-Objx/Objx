#!/usr/bin/env node

import { runCodegenCli } from './index.js';

const exitCode = await runCodegenCli(process.argv.slice(2), {
  stdout(message) {
    console.log(message);
  },
  stderr(message) {
    console.error(message);
  },
});

if (exitCode !== 0) {
  process.exitCode = exitCode;
}
