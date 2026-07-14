/**
 * Environment loading — imported for its side effect before any module reads
 * `process.env`.
 *
 * Two locations are loaded, in precedence order:
 *   1. the service's own `backend/.env` (developer / local overrides)
 *   2. the repo-root `.env` (what the Ansible deployment writes to
 *      `/opt/sb-automation/.env`)
 *
 * `dotenv` never overwrites a variable that is already set, so (1) wins where
 * both define the same key. Loading both means the app works whether the env
 * file lives beside the backend or at the project root — no code change needed
 * between local development and the production server.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
