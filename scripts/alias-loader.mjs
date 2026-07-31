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
  /*
   * `server-only` throws unless it is resolved under a bundler's react-server
   * condition, which plain `node` does not set. Stubbing it here lets scripts
   * import server modules (`regionColor.ts` pulls in sharp) without weakening
   * the guard in the app itself — the guard still holds for every real build.
   */
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export{}", format: "module", shortCircuit: true };
  }

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

  /*
   * Extensionless relative imports between TypeScript files.
   *
   * `./photoCases` is what TypeScript wants to see — writing `./photoCases.ts`
   * needs `allowImportingTsExtensions`, which would change how the Next build
   * treats the whole project for the sake of one dev-only script path. Node wants
   * the extension. Adding it here keeps the source idiomatic and the change
   * confined to a loader that only ever runs under `node --experimental-transform-types`.
   */
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!/\.[mc]?[jt]sx?$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      for (const suffix of [".ts", ".tsx"]) {
        try {
          return await next(specifier + suffix, context);
        } catch {
          // fall through to the plain specifier
        }
      }
    }
  }

  return next(specifier, context);
}
