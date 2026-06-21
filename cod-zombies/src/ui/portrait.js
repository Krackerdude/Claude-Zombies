/**
 * Procedural HUD portrait — a moody survivor bust for the player widget, drawn
 * once to a data URL. Deliberately not a literal face: a shadowed head +
 * shoulders silhouette lit cold (teal) on one edge and warm (amber) on the
 * other to echo the game's split-tone grade, over a grimy gradient with a
 * vignette. Never a flat fill — gradients, glow and speckle give it texture.
 */
export function portraitDataURL() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');

  // base gradient (cold, off-centre so it never reads flat)
  const bg = x.createRadialGradient(s * 0.40, s * 0.32, 8, s * 0.5, s * 0.52, s * 0.85);
  bg.addColorStop(0, '#223039');
  bg.addColorStop(0.55, '#10181e');
  bg.addColorStop(1, '#070b0e');
  x.fillStyle = bg;
  x.fillRect(0, 0, s, s);

  // split-tone backlight glows behind the head
  glow(x, s * 0.30, s * 0.30, s * 0.46, 'rgba(64,150,168,0.55)'); // cold teal, upper-left
  glow(x, s * 0.72, s * 0.34, s * 0.42, 'rgba(214,140,70,0.42)'); // warm amber, upper-right

  // bust silhouette (shoulders + head), near-black
  x.fillStyle = '#04070a';
  x.beginPath();
  x.moveTo(s * 0.02, s);
  x.bezierCurveTo(s * 0.10, s * 0.78, s * 0.30, s * 0.68, s * 0.50, s * 0.68);
  x.bezierCurveTo(s * 0.70, s * 0.68, s * 0.90, s * 0.78, s * 0.98, s);
  x.closePath();
  x.fill();
  x.beginPath();
  x.ellipse(s * 0.5, s * 0.45, s * 0.165, s * 0.205, 0, 0, 7);
  x.fill();
  // a hood arc cowling the head
  x.beginPath();
  x.moveTo(s * 0.28, s * 0.56);
  x.bezierCurveTo(s * 0.26, s * 0.24, s * 0.74, s * 0.24, s * 0.72, s * 0.56);
  x.lineTo(s * 0.66, s * 0.5);
  x.bezierCurveTo(s * 0.66, s * 0.32, s * 0.34, s * 0.32, s * 0.34, s * 0.5);
  x.closePath();
  x.fill();

  // rim lights along the silhouette — cold left, warm right
  rim(x, s, '#6fb6c8', -1);
  rim(x, s, '#e0a85a', 1);

  // grime speckle
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${24 + Math.random() * 40 | 0},${28 + Math.random() * 40 | 0},${0.05 + Math.random() * 0.18})`;
    const px = Math.random() * s, py = Math.random() * s, r = Math.random() * 2.4;
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }

  // vignette
  const vg = x.createRadialGradient(s * 0.5, s * 0.5, s * 0.3, s * 0.5, s * 0.5, s * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  x.fillStyle = vg;
  x.fillRect(0, 0, s, s);

  return c.toDataURL();
}

function glow(x, cx, cy, r, color) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, x.canvas.width, x.canvas.height);
}

// a soft rim stroke on one side of the head, faked by a glowing offset arc
function rim(x, s, color, side) {
  x.save();
  x.strokeStyle = color;
  x.lineWidth = 3;
  x.globalAlpha = 0.6;
  x.shadowColor = color;
  x.shadowBlur = 8;
  x.beginPath();
  const a0 = side < 0 ? Math.PI * 0.65 : -Math.PI * 0.25;
  const a1 = side < 0 ? Math.PI * 1.25 : Math.PI * 0.35;
  x.ellipse(s * 0.5 + side * s * 0.012, s * 0.45, s * 0.165, s * 0.205, 0, a0, a1);
  x.stroke();
  x.restore();
}
