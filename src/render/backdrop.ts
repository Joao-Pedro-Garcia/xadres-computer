import type { Scenery } from '../meta/catalog';

/**
 * Pinta o panorama de 360° de um tema (céu, astros, aurora, montanhas, castelos e
 * névoa) num canvas. Tudo é desenhado por código, sem imagens externas.
 * O panorama é contínuo nas bordas (u = 0 encontra u = 1).
 */
const css = (n: number, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Gerador pseudoaleatório com semente (o cenário fica igual a cada carregamento). */
function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

/** Silhueta periódica (soma de senos com frequências inteiras) para montanhas contínuas. */
function ridge(u: number, seed: number, rough: number) {
  let y = 0;
  for (let k = 1; k <= 7; k++) y += Math.sin(u * Math.PI * 2 * (k * 2 + (seed % 3)) + seed * k * 1.7) / (k * rough);
  return y;
}

export function paintPanorama(canvas: HTMLCanvasElement, sc: Scenery, horizon = 0.5) {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d')!;
  const hy = H * horizon;
  const S = H / 1024; // escala relativa ao tamanho de referência

  // Céu.
  const sky = g.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, css(sc.sky[0]));
  sky.addColorStop(0.6, css(sc.sky[1]));
  sky.addColorStop(1, css(sc.sky[2]));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hy + 2);
  const below = g.createLinearGradient(0, hy, 0, H);
  below.addColorStop(0, css(sc.mountains[1]));
  below.addColorStop(1, css(mix(sc.mountains[1], 0x000000, 0.6)));
  g.fillStyle = below;
  g.fillRect(0, hy, W, H - hy);

  const r = rng(7);
  if (sc.stars) {
    for (let i = 0; i < 900 * (W / 4096); i++) {
      const x = r() * W;
      const y = Math.pow(r(), 1.6) * hy * 0.85;
      const s = r() * 1.6 * S + 0.4;
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      g.fillRect(x, y, s, s);
    }
  }

  // Aurora: faixas onduladas e translúcidas.
  if (sc.aurora !== undefined) {
    g.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 3; band++) {
      for (let x = 0; x < W; x += 3) {
        const u = x / W;
        const y = hy * (0.18 + band * 0.07) + Math.sin(u * Math.PI * 6 + band) * 30 * S + Math.sin(u * Math.PI * 14) * 10 * S;
        const h = (60 + band * 20) * S * (0.6 + 0.4 * Math.sin(u * Math.PI * 10 + band * 2));
        const grad = g.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, css(sc.aurora, 0));
        grad.addColorStop(0.5, css(sc.aurora, 0.12));
        grad.addColorStop(1, css(sc.aurora, 0));
        g.fillStyle = grad;
        g.fillRect(x, y, 3, h);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // Astros (repetidos nos dois lados do panorama).
  for (const cx of [W * 0.62, W * 0.12]) drawCelestial(g, cx, hy * 0.32, 70 * S, sc);

  // Montanhas: distante e próxima.
  for (const [layer, color, amp, base] of [
    [0, sc.mountains[0], 120, 0.86],
    [1, sc.mountains[1], 80, 0.95],
  ] as const) {
    g.fillStyle = css(color);
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      const y = hy * base - Math.abs(ridge(x / W, layer * 5 + 3, 1.2)) * amp * S - 20 * S;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }

  // Castelos: o principal em frente às brancas (u = 0,5) e outro do lado oposto.
  drawCastle(g, W * 0.5, hy, 1.0 * S, sc, 11);
  drawCastle(g, W * 0.0, hy, 0.8 * S, sc, 23);
  drawCastle(g, W * 1.0, hy, 0.8 * S, sc, 23);
  // Torres distantes espalhadas.
  for (const u of [0.24, 0.33, 0.72, 0.8]) drawTower(g, W * u, hy * 0.97, 0.45 * S, sc, false);

  // Névoa no horizonte.
  const mist = g.createLinearGradient(0, hy * 0.75, 0, hy * 1.08);
  mist.addColorStop(0, css(sc.mist, 0));
  mist.addColorStop(0.7, css(sc.mist, 0.35));
  mist.addColorStop(1, css(sc.mist, 0));
  g.fillStyle = mist;
  g.fillRect(0, hy * 0.75, W, hy * 0.33);
}

function drawCelestial(g: CanvasRenderingContext2D, x: number, y: number, R: number, sc: Scenery) {
  const c = sc.celestialColor;
  const glow = g.createRadialGradient(x, y, R * 0.3, x, y, R * 4);
  glow.addColorStop(0, css(c, 0.45));
  glow.addColorStop(1, css(c, 0));
  g.fillStyle = glow;
  g.fillRect(x - R * 4, y - R * 4, R * 8, R * 8);
  if (sc.celestial === 'eclipse') {
    g.fillStyle = css(c, 0.9);
    g.beginPath();
    g.arc(x, y, R * 1.05, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#050308';
    g.beginPath();
    g.arc(x, y, R, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (sc.celestial === 'planets') {
    g.fillStyle = css(c);
    g.beginPath();
    g.arc(x, y, R * 1.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = css(0xffffff, 0.6);
    g.lineWidth = R * 0.12;
    g.beginPath();
    g.ellipse(x, y, R * 2.3, R * 0.5, -0.3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = css(0x7ae0ff);
    g.beginPath();
    g.arc(x + R * 3.5, y + R * 1.2, R * 0.45, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.fillStyle = css(c);
  g.beginPath();
  g.arc(x, y, R, 0, Math.PI * 2);
  g.fill();
  if (sc.celestial === 'moon' || sc.celestial === 'twinMoons') {
    g.fillStyle = css(0x000000, 0.08);
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [0.05, 0.4, 0.12]]) {
      g.beginPath();
      g.arc(x + dx * R, y + dy * R, rr * R, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (sc.celestial === 'sun') {
    g.strokeStyle = css(c, 0.25);
    g.lineWidth = R * 0.08;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * R * 1.3, y + Math.sin(a) * R * 1.3);
      g.lineTo(x + Math.cos(a) * R * 2.1, y + Math.sin(a) * R * 2.1);
      g.stroke();
    }
  }
}

/** Uma torre: corpo, ameias ou telhado, janelas acesas e bandeira. */
function drawTower(g: CanvasRenderingContext2D, x: number, base: number, s: number, sc: Scenery, flag: boolean, w = 54, h = 300) {
  const { stone, roof, window: win, style } = sc.castle;
  const tw = w * s;
  const th = h * s;
  const top = base - th;
  const bodyGrad = g.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
  bodyGrad.addColorStop(0, css(mix(stone, 0xffffff, 0.12)));
  bodyGrad.addColorStop(1, css(mix(stone, 0x000000, 0.35)));
  g.fillStyle = bodyGrad;
  if (style === 'ice') {
    g.beginPath();
    g.moveTo(x - tw / 2, base);
    g.lineTo(x - tw * 0.3, top);
    g.lineTo(x, top - th * 0.55);
    g.lineTo(x + tw * 0.3, top);
    g.lineTo(x + tw / 2, base);
    g.closePath();
    g.globalAlpha = 0.9;
    g.fill();
    g.globalAlpha = 1;
  } else {
    g.fillRect(x - tw / 2, top, tw, th);
  }
  // Telhado conforme o estilo.
  g.fillStyle = css(roof);
  if (style === 'gothic' || style === 'floating') {
    g.beginPath();
    g.moveTo(x - tw * 0.62, top);
    g.lineTo(x, top - th * 0.55);
    g.lineTo(x + tw * 0.62, top);
    g.closePath();
    g.fill();
  } else if (style === 'palace') {
    g.beginPath();
    g.ellipse(x, top, tw * 0.6, tw * 0.7, 0, Math.PI, 0);
    g.fill();
    g.fillRect(x - 2 * s, top - tw * 0.7 - 30 * s, 4 * s, 30 * s);
  } else if (style === 'fortress' || style === 'temple') {
    for (let i = 0; i < 4; i++) g.fillRect(x - tw / 2 + (i * tw) / 3.5, top - 14 * s, tw / 6, 14 * s);
    if (style === 'fortress') {
      g.beginPath();
      g.moveTo(x - tw * 0.2, top - 14 * s);
      g.lineTo(x, top - 70 * s);
      g.lineTo(x + tw * 0.2, top - 14 * s);
      g.fill();
    }
  }
  // Janelas acesas.
  g.fillStyle = css(win);
  g.shadowColor = css(win);
  g.shadowBlur = 12 * s;
  for (let j = 0; j < 3; j++) {
    const wy = top + th * (0.2 + j * 0.25);
    g.beginPath();
    g.ellipse(x, wy, 5 * s, 9 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;
  if (flag) {
    const fy = top - (style === 'gothic' || style === 'floating' ? th * 0.55 : 30 * s);
    g.strokeStyle = css(mix(stone, 0xffffff, 0.3));
    g.lineWidth = 2 * s;
    g.beginPath();
    g.moveTo(x, fy);
    g.lineTo(x, fy - 40 * s);
    g.stroke();
    g.fillStyle = css(win, 0.9);
    g.beginPath();
    g.moveTo(x, fy - 40 * s);
    g.quadraticCurveTo(x + 22 * s, fy - 44 * s, x + 38 * s, fy - 34 * s);
    g.lineTo(x, fy - 26 * s);
    g.fill();
  }
}

/** Castelo completo: muralha, portão, torres laterais e torre central. */
function drawCastle(g: CanvasRenderingContext2D, cx: number, horizon: number, s: number, sc: Scenery, seed: number) {
  const { stone, window: win, style } = sc.castle;
  let base = horizon + 10 * s;
  if (style === 'floating') {
    // Ilha flutuante sob o castelo, com cristais pendurados.
    base = horizon - 90 * s;
    g.fillStyle = css(mix(stone, 0x000000, 0.45));
    g.beginPath();
    g.moveTo(cx - 260 * s, base);
    g.quadraticCurveTo(cx - 150 * s, base + 220 * s, cx, base + 260 * s);
    g.quadraticCurveTo(cx + 150 * s, base + 220 * s, cx + 260 * s, base);
    g.closePath();
    g.fill();
    g.fillStyle = css(sc.propGlow, 0.8);
    for (const dx of [-120, -40, 60, 140]) {
      g.beginPath();
      g.moveTo(cx + dx * s - 8 * s, base + 120 * s);
      g.lineTo(cx + dx * s, base + 190 * s);
      g.lineTo(cx + dx * s + 8 * s, base + 120 * s);
      g.fill();
    }
  }
  if (style === 'temple') {
    // Templo: escadaria, colunas e frontão.
    const w = 420 * s;
    g.fillStyle = css(mix(stone, 0x000000, 0.15));
    for (let i = 0; i < 4; i++) g.fillRect(cx - w / 2 - i * 12 * s, base - i * 10 * s, w + i * 24 * s, 10 * s);
    g.fillStyle = css(stone);
    const colTop = base - 40 * s - 210 * s;
    for (let i = 0; i < 8; i++) g.fillRect(cx - w / 2 + 20 * s + (i * (w - 40 * s)) / 7 - 10 * s, colTop, 20 * s, 210 * s);
    g.fillRect(cx - w / 2, colTop - 24 * s, w, 24 * s);
    g.beginPath();
    g.moveTo(cx - w / 2 - 10 * s, colTop - 24 * s);
    g.lineTo(cx, colTop - 110 * s);
    g.lineTo(cx + w / 2 + 10 * s, colTop - 24 * s);
    g.fill();
    g.fillStyle = css(win, 0.5);
    g.fillRect(cx - 40 * s, colTop + 40 * s, 80 * s, 170 * s);
    return;
  }
  // Muralha com ameias e portão.
  const wallW = 440 * s;
  const wallH = 120 * s;
  const wallGrad = g.createLinearGradient(0, base - wallH, 0, base);
  wallGrad.addColorStop(0, css(mix(stone, 0xffffff, 0.08)));
  wallGrad.addColorStop(1, css(mix(stone, 0x000000, 0.4)));
  g.fillStyle = wallGrad;
  g.fillRect(cx - wallW / 2, base - wallH, wallW, wallH);
  for (let x = cx - wallW / 2; x < cx + wallW / 2; x += 28 * s) g.fillRect(x, base - wallH - 14 * s, 16 * s, 14 * s);
  g.fillStyle = css(mix(stone, 0x000000, 0.7));
  g.beginPath();
  g.moveTo(cx - 34 * s, base);
  g.lineTo(cx - 34 * s, base - 60 * s);
  g.arc(cx, base - 60 * s, 34 * s, Math.PI, 0);
  g.lineTo(cx + 34 * s, base);
  g.fill();
  g.fillStyle = css(win, 0.35);
  g.fillRect(cx - 30 * s, base - 50 * s, 60 * s, 50 * s);
  // Torres.
  const r = rng(seed);
  const towers = [
    [-wallW / 2, 64, 300],
    [wallW / 2, 64, 300],
    [-110 * s, 50, 360],
    [110 * s, 50, 360],
    [0, 80, 470],
  ] as const;
  for (const [dx, w, h] of towers) drawTower(g, cx + dx, base - wallH * 0.2, s, sc, true, w * (0.9 + r() * 0.2), h * (0.9 + r() * 0.2));
}
