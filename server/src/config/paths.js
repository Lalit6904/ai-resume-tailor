import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/config -> repository root
export const ROOT_DIR = path.resolve(__dirname, '../../..');
export const SERVER_DIR = path.resolve(__dirname, '../..');
export const STORAGE_ROOT = path.resolve(ROOT_DIR, 'storage');
export const CLIENT_DIST = path.resolve(ROOT_DIR, 'client/dist');
