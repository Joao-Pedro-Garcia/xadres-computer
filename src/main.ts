import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('app')!;
try {
  new App(root).start();
} catch (err) {
  console.error(err);
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = 'Arcane Chess: erro ao iniciar / failed to start. ' + String(err);
  document.getElementById('loading')?.remove();
  root.append(msg);
}
