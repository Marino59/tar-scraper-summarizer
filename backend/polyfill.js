import { createRequire } from 'module';
const require = createRequire(import.meta.url);

if (typeof process.getBuiltinModule !== 'function') {
  process.getBuiltinModule = function(id) {
    const cleanId = id.startsWith('node:') ? id.substring(5) : id;
    return require(cleanId);
  };
}
