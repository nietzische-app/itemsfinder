import { pathToFileURL } from "node:url";

/**
 * Resolves the `@/*` tsconfig path alias for plain `node` runs.
 *
 * Node does not read tsconfig `paths`, so scripts that import app modules
 * directly need this hook. Used with `--experimental-transform-types`, which
 * strips the TypeScript syntax.
 */
const SRC = new URL("../src/", import.meta.url).pathname;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = SRC + specifier.slice(2);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      try {
        return await next(pathToFileURL(candidate).href, context);
      } catch {
        // try the next extension
      }
    }
  }
  return next(specifier, context);
}
