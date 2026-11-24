// Use the project's existing compiler with Node's test runner; no test framework.
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
const ts = createRequire(new URL('../functions/package.json', import.meta.url))('typescript')

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context)
      throw error
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText }
    }
    return next(url, context)
  },
})
