// Registers the `@/` resolver hook for `node --test`.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./alias-loader.mjs', pathToFileURL(import.meta.filename));
