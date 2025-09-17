/* ===== Configuración ===== */
// Duración del color rojo tras colisión (ms)
const FLASH_MS = 240;

// Rango de radios
const MIN_RADIUS = 24;
const MAX_RADIUS = 50;

// Velocidad mínima que garantizamos tras choque (como porcentaje de la base)
const MIN_SPEED_FACTOR = 0.7;

// Rebote en paredes (1 = elástico)
const BORDER_RESTITUTION = 1.0;

/* ===== Lienzo ===== */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

/* ===== UI ===== */
const countInput = document.getElementById("count");
const speedInput = document.getElementById("speed");
const regenBtn   = document.getElementById("regen");

/* ===== Utilidades ===== */
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

const PALETTE = ["#60a5fa","#34d399","#fbbf24","#f472b6","#a78bfa","#22d3ee","#f87171"];
function randomColor() {
  return PALETTE[randInt(0, PALETTE.length - 1)];
}

function ensureMinSpeed(c, minSpeed) {
  const vmag = Math.hypot(c.vx, c.vy);
  if (vmag < minSpeed) {
    const scale = (minSpeed + 1e-6) / (vmag + 1e-6);
    c.vx *= scale; c.vy *= scale;
  }
}

/* ===== Clase Círculo ===== */
class Circle {
  constructor(x, y, r, color, vx, vy, label = "") {
    this.posX = x;
    this.posY = y;
    this.radius = r;

    this.baseColor = color;     // color normal (cambia después del flash)
    this.pendingColor = null;   // color que adoptará al terminar el flash
    this.flashUntil = 0;        // timestamp ms hasta el que se ve rojo

    this.vx = vx; // px/s
    this.vy = vy; // px/s

    this.label = label;
  }

  draw(context, now) {
    const flashing = now < this.flashUntil;
    const fill = flashing ? "red" : this.baseColor;

    context.beginPath();
    context.arc(this.posX, this.posY, this.radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();

    // borde blanco para contraste sobre fondo negro
    context.lineWidth = 2.5;
    context.strokeStyle = "#ffffff";
    context.stroke();

    if (this.label) {
      context.fillStyle = "#ffffff";
      context.font = "600 14px system-ui, Segoe UI, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(this.label, this.posX, this.posY);
    }

    // si terminó el flash, aplica el color pendiente
    if (!flashing && this.pendingColor) {
      this.baseColor = this.pendingColor;
      this.pendingColor = null;
    }
  }

  update(dt, width, height) {
    // Rebote en paredes
    if (this.posX + this.radius >= width) {
      this.posX = width - this.radius;
      this.vx = -this.vx * BORDER_RESTITUTION;
    } else if (this.posX - this.radius <= 0) {
      this.posX = this.radius;
      this.vx = -this.vx * BORDER_RESTITUTION;
    }

    if (this.posY + this.radius >= height) {
      this.posY = height - this.radius;
      this.vy = -this.vy * BORDER_RESTITUTION;
    } else if (this.posY - this.radius <= 0) {
      this.posY = this.radius;
      this.vy = -this.vy * BORDER_RESTITUTION;
    }

    // Integración (dt en segundos) — velocidades son px/s
    this.posX += this.vx * dt;
    this.posY += this.vy * dt;
  }
}

/* ===== Generación sin solapamientos fuertes ===== */
function createCircles(n, width, height, baseSpeed) {
  const circles = [];
  let attemptsLimit = 6000;

  for (let i = 0; i < n; i++) {
    const r = randInt(MIN_RADIUS, MAX_RADIUS);
    let x, y, ok = false;

    // Posición inicial evitando solapes grandes
    while (!ok && attemptsLimit-- > 0) {
      x = rand(r, width - r);
      y = rand(r, height - r);
      ok = true;
      for (const c of circles) {
        if (Math.hypot(x - c.posX, y - c.posY) < r + c.radius + 2) { ok = false; break; }
      }
    }

    // Velocidad por ángulo + magnitud alrededor de baseSpeed
    const angle = rand(0, Math.PI * 2);
    const speed = Math.max(10, baseSpeed + rand(-40, 40)); // pequeña variación
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const color = randomColor();
    const circle = new Circle(x, y, r, color, vx, vy, String(i + 1));
    circles.push(circle);
  }
  return circles;
}

/* ===== Colisión círculo-círculo (masas iguales) ===== */
function resolveCollision(a, b, now, baseSpeed) {
  const dx = b.posX - a.posX;
  const dy = b.posY - a.posY;
  let dist = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius;

  if (dist === 0) dist = 0.01;

  if (dist < minDist) {
    // Activar flash rojo y programar color nuevo
    a.flashUntil = now + FLASH_MS;
    b.flashUntil = now + FLASH_MS;
    a.pendingColor = randomColor();
    b.pendingColor = randomColor();

    // Normal y tangente
    const nx = dx / dist;
    const ny = dy / dist;
    const tx = -ny, ty = nx;

    // Separación posicional (mitad a cada uno)
    const overlap = (minDist - dist) / 2;
    a.posX -= nx * overlap; a.posY -= ny * overlap;
    b.posX += nx * overlap; b.posY += ny * overlap;

    // Proyección de velocidades
    const vAn = a.vx * nx + a.vy * ny;
    const vAt = a.vx * tx + a.vy * ty;
    const vBn = b.vx * nx + b.vy * ny;
    const vBt = b.vx * tx + b.vy * ty;

    // Si ya se separan a lo largo de la normal, no aplicar
    if (vBn - vAn > 0) return;

    // Colisión elástica (mismas masas): intercambiar componente normal
    const vAnPrime = vBn;
    const vBnPrime = vAn;

    a.vx = vAnPrime * nx + vAt * tx;
    a.vy = vAnPrime * ny + vAt * ty;
    b.vx = vBnPrime * nx + vBt * tx;
    b.vy = vBnPrime * ny + vBt * ty;

    // Evitar que queden "muertos": asegurar velocidad mínima
    const minSpeed = baseSpeed * MIN_SPEED_FACTOR;
    ensureMinSpeed(a, minSpeed);
    ensureMinSpeed(b, minSpeed);
  }
}

/* ===== Simulación ===== */
let circles = [];
let lastTs = performance.now();

function regenerate() {
  const n = Math.max(2, Math.min(300, Number(countInput.value) || 20));
  const baseSpeed = Math.max(50, Math.min(600, Number(speedInput.value) || 180));
  circles = createCircles(n, canvas.width, canvas.height, baseSpeed);
}
regenBtn.addEventListener("click", regenerate);

// Enter en cualquiera de los inputs => regenerar
[countInput, speedInput].forEach(el => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      regenerate();
    }
  });
});

function loop(ts) {
  const now = ts;
  const dt = Math.min(0.035, (ts - lastTs) / 1000); // seg, cap 35ms
  lastTs = ts;

  const baseSpeed = Math.max(50, Math.min(600, Number(speedInput.value) || 180));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Actualiza
  for (const c of circles) c.update(dt, canvas.width, canvas.height);

  // Colisiones O(n^2)
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      resolveCollision(circles[i], circles[j], now, baseSpeed);
    }
  }

  // Dibuja
  for (const c of circles) c.draw(ctx, now);

  requestAnimationFrame(loop);
}

/* Inicio */
regenerate();
requestAnimationFrame(loop);