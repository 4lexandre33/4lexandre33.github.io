/* encontra arquivos de apoio tanto no código-fonte (lib/../x) quanto no pacote único (dist/x) */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
export function asset(...parts) {
  for (const base of [HERE, join(HERE, "..")]) { const p = join(base, ...parts); if (existsSync(p)) return p; }
  return join(HERE, "..", ...parts);
}
export const HERE_DIR = HERE;
