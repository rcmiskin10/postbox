// Bundle the CLI (src/cli.mjs + its deps) into a single zero-dependency bin/postbox.mjs.
// This is what makes postbox installable as a Claude Code plugin: the plugin is a git clone
// with no `npm install` step, so the binary it runs must carry its own deps inlined.
//
// Why the createRequire banner: esbuild emits ESM, but `yaml` is CommonJS and dynamically
// require()s Node builtins. In an ESM output `require` is undefined, so esbuild's interop
// shim throws "Dynamic require of 'process' is not supported". Defining a real require via
// createRequire makes that shim resolve builtins natively.
import { build } from 'esbuild';
import { chmodSync } from 'node:fs';

await build({
  entryPoints: ['src/cli.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: 'bin/postbox.mjs',
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire } from "node:module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});

chmodSync('bin/postbox.mjs', 0o755);
