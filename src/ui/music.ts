/**
 * Música ambiente calma, gerada em tempo real com WebAudio (sem arquivos externos).
 * Acordes suaves (pads) em progressão lenta + notas de harpa esparsas com eco.
 */

/** Progressão em lá menor: Am9 · Fmaj7 · Cmaj7 · G6sus — 8 s por acorde. */
export const PROGRESSION: number[][] = [
  [57, 60, 64, 67, 71], // Am9 (A C E G B)
  [53, 57, 60, 64, 69], // Fmaj7 (F A C E) + A
  [48, 55, 59, 64, 67], // Cmaj7 (C G B E G)
  [55, 59, 62, 64, 69], // G6sus (G B D E A)
];
export const BAR_SECONDS = 8;
/** Escala pentatônica de lá menor para a melodia (consonante com todos os acordes). */
export const MELODY_SCALE = [69, 72, 74, 76, 79, 81, 84];

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function chordAt(bar: number): number[] {
  return PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
}

/** Notas da melodia de um compasso (determinístico pela semente), em [tempo, midi]. */
export function melodyFor(bar: number, seed = 1): [number, number][] {
  let x = (bar * 9301 + seed * 49297) % 233280;
  const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const notes: [number, number][] = [];
  const count = 2 + Math.floor(rnd() * 3); // 2 a 4 notas por compasso: esparso e calmo
  for (let i = 0; i < count; i++) {
    const time = Math.floor(rnd() * 8) * (BAR_SECONDS / 8);
    notes.push([time, MELODY_SCALE[Math.floor(rnd() * MELODY_SCALE.length)]]);
  }
  return notes.sort((a, b) => a[0] - b[0]);
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private nextBarTime = 0;
  private bar = 0;
  private unlocked = false;
  private enabled = true;
  private volume = 0.5;
  private playing = false;

  constructor() {
    // O navegador só libera áudio depois de um gesto do usuário.
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.update();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => this.update());
  }

  /** Liga/desliga e ajusta o volume (0 a 1, já multiplicado pelo volume geral). */
  configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.35, this.ctx.currentTime, 0.4);
    this.update();
  }

  get isPlaying() {
    return this.playing;
  }

  private update() {
    const shouldPlay = this.enabled && this.volume > 0 && this.unlocked && !document.hidden;
    if (shouldPlay && !this.playing) this.start();
    else if (!shouldPlay && this.playing) this.stop();
  }

  private start() {
    try {
      this.ctx ??= new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      // Eco suave (delay com realimentação) para dar ambiência.
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.45;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      const wet = ctx.createGain();
      wet.gain.value = 0.3;
      this.master.connect(ctx.destination);
      this.master.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(ctx.destination);
    }
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume * 0.35, ctx.currentTime, 1.2); // entrada gradual
    this.playing = true;
    this.nextBarTime = ctx.currentTime + 0.2;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 1000);
  }

  private stop() {
    this.playing = false;
    clearInterval(this.timer);
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this.playing) void ctx.suspend();
      }, 1500);
    }
  }

  /** Agenda compassos com antecedência (o relógio do WebAudio é preciso; o setInterval não). */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    if (ctx.state === 'suspended') void ctx.resume();
    while (this.nextBarTime < ctx.currentTime + BAR_SECONDS) {
      this.playBar(this.bar, this.nextBarTime);
      this.bar++;
      this.nextBarTime += BAR_SECONDS;
    }
  }

  private playBar(bar: number, t0: number) {
    const ctx = this.ctx!;
    const out = this.master!;
    // Pad: notas do acorde com ataque e liberação lentos, filtradas.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.3;
    filter.connect(out);
    for (const note of chordAt(bar)) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiToHz(note - 12);
        o.detune.value = detune;
        const g = ctx.createGain();
        const end = t0 + BAR_SECONDS + 2;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.045, t0 + 2.5);
        g.gain.setValueAtTime(0.045, t0 + BAR_SECONDS - 0.5);
        g.gain.linearRampToValueAtTime(0, end);
        o.connect(g).connect(filter);
        o.start(t0);
        o.stop(end + 0.1);
      }
    }
    // Baixo grave e suave.
    const root = chordAt(bar)[0] - 24;
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = midiToHz(root);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t0);
    bg.gain.linearRampToValueAtTime(0.08, t0 + 1.5);
    bg.gain.linearRampToValueAtTime(0, t0 + BAR_SECONDS + 1);
    bass.connect(bg).connect(out);
    bass.start(t0);
    bass.stop(t0 + BAR_SECONDS + 1.2);
    // Melodia esparsa tipo harpa/celesta.
    for (const [dt, note] of melodyFor(bar)) {
      const t = t0 + dt;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiToHz(note);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 2.7);
    }
  }
}
