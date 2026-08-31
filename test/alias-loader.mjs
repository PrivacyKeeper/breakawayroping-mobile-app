// A resolver hook that teaches `node --test` two things it does not know.
//
// 1. THE `@/` ALIAS. tsconfig maps `@/*` to `src/*` and TypeScript honours it
//    at typecheck time. Node resolves specifiers itself, so an integration
//    test that imports the real `src/lib/queries.ts` dies on its
//    `@/constants/theme` import before a single assertion runs.
//
// 2. REACT NATIVE MODULES. `supabase.ts` hands AsyncStorage to supabase-js as
//    its session store, and that package cannot load outside a React Native
//    runtime.
//
// Both exist so the test can exercise the SHIPPING module rather than a copy
// built for tests. A test that constructs its own Supabase client verifies
// nothing about the one that actually runs on a phone.

import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolvePath(here, '..', 'src');

/** Platform modules with no Node equivalent, pointed at a local stand-in. */
const STUBS = {
  '@react-native-async-storage/async-storage': resolvePath(
    here,
    'stubs',
    'async-storage.mjs',
  ),
};

/**
 * `@/constants/theme` carries no extension because TypeScript does not need
 * one. Node does, so the candidates are tried in the order the compiler would.
 */
function withExtension(base) {
  if (existsSync(base)) return base;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return base;
}

export function resolve(specifier, context, nextResolve) {
  const stub = STUBS[specifier];
  if (stub) {
    return nextResolve(pathToFileURL(stub).href, context);
  }

  if (specifier.startsWith('@/')) {
    const target = withExtension(resolvePath(srcRoot, specifier.slice(2)));
    return nextResolve(pathToFileURL(target).href, context);
  }

  return nextResolve(specifier, context);
}
