import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

export function loadTsModule(path, imports = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const moduleRecord = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(imports, id)) return imports[id];
    if (id === '@/lib/image-evidence') return loadTsModule('../lib/image-evidence.ts');
    if (id === 'node:crypto') return nodeRequire(id);
    throw new Error(`Unexpected import in test module: ${id}`);
  };
  vm.runInNewContext('(function(exports, require, module) {' + compiled + '\n})', {
    Set, Date, Math, Number, Object, Array, String, RegExp,
    Request, Response, URL, TextDecoder, TextEncoder, Uint8Array, Promise, Map, JSON, Buffer, console,
    AbortSignal, fetch: globalThis.fetch, process: globalThis.process,
    ...globals,
  })
    (moduleRecord.exports, localRequire, moduleRecord);
  return moduleRecord.exports;
}
