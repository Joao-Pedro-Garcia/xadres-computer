import type { Lang } from '../meta/settings';
import { ptBR } from './pt-BR';
import { en } from './en';

export type Dict = typeof ptBR;
const DICTS: Record<Lang, Dict> = { 'pt-BR': ptBR, en };

let current: Lang = 'pt-BR';

export function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return current;
}

/** Tradução por chave com pontos (ex.: "menu.play") e interpolação {nome}. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const find = (d: Dict) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), d);
  let v = find(DICTS[current]);
  if (typeof v !== 'string') v = find(ptBR);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
