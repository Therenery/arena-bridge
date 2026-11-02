#!/usr/bin/env node
'use strict';

require('../src/cli').main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
