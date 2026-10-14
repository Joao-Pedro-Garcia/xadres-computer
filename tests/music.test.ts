import { describe, expect, it } from 'vitest';
import { BAR_SECONDS, MELODY_SCALE, PROGRESSION, chordAt, melodyFor, midiToHz } from '../src/ui/music';
import { sanitizeSettings } from '../src/meta/settings';

describe('música ambiente', () => {
  it('afinação e progressão em ciclo', () => {
    expect(midiToHz(69)).toBe(440);
    expect(chordAt(0)).toBe(PROGRESSION[0]);
    expect(chordAt(PROGRESSION.length)).toBe(PROGRESSION[0]);
  });

  it('melodia calma: poucas notas por compasso, dentro da escala e do compasso', () => {
    for (let bar = 0; bar < 50; bar++) {
      const notes = melodyFor(bar);
      expect(notes.length).toBeGreaterThanOrEqual(2);
      expect(notes.length).toBeLessThanOrEqual(4);
      for (const [time, note] of notes) {
        expect(time).toBeGreaterThanOrEqual(0);
        expect(time).toBeLessThan(BAR_SECONDS);
        expect(MELODY_SCALE).toContain(note);
      }
    }
    expect(melodyFor(3)).toEqual(melodyFor(3)); // determinística
  });

  it('configurações de música: padrão, limites e desligar', () => {
    const d = sanitizeSettings({});
    expect(d.music).toBe(true);
    expect(d.musicVolume).toBe(0.5);
    const s = sanitizeSettings({ music: false, musicVolume: 5 });
    expect(s.music).toBe(false);
    expect(s.musicVolume).toBe(1);
    expect(sanitizeSettings({ music: 'sim' }).music).toBe(true);
  });
});
