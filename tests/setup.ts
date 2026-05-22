/**
 * Global test setup. Imported as a side-effect by every test file that needs
 * server-only modules.
 *
 * Why: `src/lib/automations.ts`, `src/lib/queries.ts`, etc. import the
 * `server-only` package, which throws unconditionally from Node. Next.js
 * webpack-aliases it to a stub at build time; here we register an empty CJS
 * module before any user import resolves the throw.
 */
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const _serverOnlyPath = _require.resolve("server-only");
if (!_require.cache[_serverOnlyPath]) {
  _require.cache[_serverOnlyPath] = {
    id: _serverOnlyPath,
    filename: _serverOnlyPath,
    loaded: true,
    exports: {},
    // @ts-expect-error — partial Module shape, sufficient for the cache hit
    children: [],
    paths: [],
  };
}
