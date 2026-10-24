import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

async function listModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listModules(fullPath)));
    } else if (entry.name.endsWith('.js') && entry.name !== 'server.js') {
      // server.js performs startup side effects; every other module must be
      // importable so missing relative paths fail here instead of at runtime.
      files.push(fullPath);
    }
  }
  return files;
}

describe('server module graph', () => {
  it('imports every source module without resolution errors', async () => {
    const files = await listModules(SRC_ROOT);
    expect(files.length).toBeGreaterThan(30);

    const failures = [];
    for (const file of files.sort()) {
      try {
        await import(pathToFileURL(file).href);
      } catch (error) {
        failures.push(`${path.relative(SRC_ROOT, file)}: ${error.message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
