/**
 * Persistência local. Todos os dados (perfil, configurações, partida salva e
 * histórico) são pequenos e lidos de forma síncrona na inicialização, por isso
 * usamos localStorage. O histórico é limitado para não crescer sem controle.
 * Os dados ficam apenas neste navegador e podem ser perdidos ou alterados pelo usuário.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function defaultStore(): KeyValueStore {
  try {
    const t = '__arcane_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return new MemoryStore();
  }
}

export function readJson<T>(store: KeyValueStore, key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    if (validate && !validate(v)) return fallback;
    return v as T;
  } catch {
    return fallback;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const KEYS = {
  profile: 'arcane.profile.v1',
  settings: 'arcane.settings.v1',
  savedGame: 'arcane.savedGame.v1',
  history: 'arcane.history.v1',
} as const;
