import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('app')!;
function fatal(err: unknown) {
  console.error(err);
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = 'Arcane Chess: erro ao iniciar / failed to start. ' + String(err);
  document.getElementById('loading')?.remove();
  root.append(msg);
}

try {
  new App(root).start().catch(fatal);
} catch (err) {
  fatal(err);
}

// Modo offline / instalação como app (somente no build de produção).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker não registrado:', e));
  });
}
