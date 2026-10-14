export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  back: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

interface Tween {
  start: number;
  duration: number;
  update: (t: number) => void;
  ease: Ease;
  resolve: () => void;
  done: boolean;
}

/** Gerenciador de tweens baseado em tempo. `finishAll` conclui tudo instantaneamente. */
export class Tweens {
  private list: Tween[] = [];
  private now = 0;
  speed = 1;

  tick(nowMs: number) {
    this.now = nowMs;
    for (const tw of this.list) {
      if (tw.start < 0) tw.start = nowMs;
      const t = Math.min(1, (nowMs - tw.start) / Math.max(1, tw.duration / this.speed));
      tw.update(tw.ease(t));
      if (t >= 1) this.finish(tw);
    }
    this.list = this.list.filter((t) => !t.done);
  }

  private finish(tw: Tween) {
    if (tw.done) return;
    tw.done = true;
    tw.update(1);
    tw.resolve();
  }

  run(duration: number, update: (t: number) => void, e: Ease = ease.inOut): Promise<void> {
    return new Promise((resolve) => {
      this.list.push({ start: -1, duration, update, ease: e, resolve, done: false });
    });
  }

  wait(ms: number): Promise<void> {
    return this.run(ms, () => {}, ease.linear);
  }

  finishAll() {
    // Concluir pode disparar novos tweens encadeados; repete até esvaziar.
    for (let guard = 0; guard < 50 && this.list.length; guard++) {
      const cur = this.list;
      this.list = [];
      for (const tw of cur) this.finish(tw);
    }
  }

  get busy() {
    return this.list.length > 0;
  }

  get time() {
    return this.now;
  }
}
