import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizePreferences } from './core.mjs';

// Preferences are stored by stable GitHub numeric user ID (not mutable login).
// Single-process atomic writes. For multiple instances, use a real database.
export class PreferenceStore {
  constructor(path = process.env.DATA_FILE || './data/users.json') {
    this.path = resolve(path);
    try {
      const data = JSON.parse(readFileSync(this.path, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid stored preferences');
      this.users = data;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.users = {};
    }
  }

  get(id) {
    const key = String(id);
    return normalizePreferences(this.users[key] || {});
  }

  set(id, value) {
    const key = String(id);
    if (!/^(?:[0-9]+|local)$/.test(key)) throw new TypeError('Invalid user ID');
    const prefs = normalizePreferences(value);
    this.users[key] = prefs;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(this.users, null, 2) + '\n', { mode: 0o600 });
      renameSync(temp, this.path);
    } catch (error) {
      throw error;
    }
    return prefs;
  }
}
