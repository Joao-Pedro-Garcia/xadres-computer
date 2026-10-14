/** Efeitos sonoros sintetizados com WebAudio (sem arquivos externos). */
export type Sfx = 'select' | 'move' | 'capture' | 'power' | 'check' | 'win' | 'loss' | 'error' | 'click';

export class Audio {
  private ctx: AudioContext | null = null;
  enabled = true;
  volume = 0.6;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.volume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, gain: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = gain * this.volume;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  }

  play(s: Sfx) {
    if (!this.enabled) return;
    switch (s) {
      case 'click':
        return this.tone(660, 0.06, 'sine', 0.08);
      case 'select':
        return this.tone(880, 0.08, 'triangle', 0.1);
      case 'move':
        this.tone(220, 0.12, 'sine', 0.2);
        return this.noise(0.08, 0.12);
      case 'capture':
        this.noise(0.35, 0.35);
        this.tone(160, 0.35, 'sawtooth', 0.12, 0, 60);
        return this.tone(990, 0.3, 'sine', 0.08, 0.05, 1500);
      case 'power':
        this.tone(440, 0.4, 'sine', 0.12, 0, 1320);
        return this.tone(660, 0.45, 'triangle', 0.08, 0.08, 1760);
      case 'check':
        this.tone(740, 0.15, 'square', 0.07);
        return this.tone(740, 0.2, 'square', 0.07, 0.18);
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, i * 0.12));
        return;
      case 'loss':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.45, 'sine', 0.12, i * 0.18));
        return;
      case 'error':
        return this.tone(180, 0.15, 'square', 0.06);
    }
  }
}
