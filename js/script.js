// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
const Input = {
  keys: Array(230).fill(false),
  mouse: { left: false, right: false, middle: false, x: 0, y: 0 }
};

document.addEventListener('keydown', e => { Input.keys[e.keyCode] = true; });
document.addEventListener('keyup',   e => { Input.keys[e.keyCode] = false; });

document.addEventListener('mousedown', e => {
  if (e.button === 0) Input.mouse.left   = true;
  if (e.button === 1) Input.mouse.middle = true;
  if (e.button === 2) Input.mouse.right  = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) Input.mouse.left   = false;
  if (e.button === 1) Input.mouse.middle = false;
  if (e.button === 2) Input.mouse.right  = false;
});
document.addEventListener('mousemove', e => {
  Input.mouse.x = e.clientX;
  Input.mouse.y = e.clientY;
});

// ─────────────────────────────────────────────
//  CANVAS
// ─────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─────────────────────────────────────────────
//  CURSOR
// ─────────────────────────────────────────────
const cursorEl = document.getElementById('cursor');
let mx = window.innerWidth / 2;
let my = window.innerHeight / 2;

document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cursorEl.style.left = mx + 'px';
  cursorEl.style.top  = my + 'px';
});

document.querySelectorAll('a, button, .project-card').forEach(el => {
  el.addEventListener('mouseenter', () => cursorEl.classList.add('hover'));
  el.addEventListener('mouseleave', () => cursorEl.classList.remove('hover'));
});

// ─────────────────────────────────────────────
//  SEGMENT
// ─────────────────────────────────────────────
class Segment {
  constructor(parent, size, angle, range, stiffness) {
    this.isSegment = true;
    this.parent    = parent;
    this.children  = [];
    this.size      = size;
    this.relAngle  = angle;
    this.defAngle  = angle;
    this.absAngle  = parent.absAngle + angle;
    this.range     = range;
    this.stiffness = stiffness;

    if (Array.isArray(parent.children)) parent.children.push(this);
    this.updateRelative(false, true);
  }

  updateRelative(iter, flex) {
    this.relAngle -= 2 * Math.PI * Math.floor(
      (this.relAngle - this.defAngle) / (2 * Math.PI) + 0.5
    );

    if (flex) {
      this.relAngle = Math.min(
        this.defAngle + this.range / 2,
        Math.max(
          this.defAngle - this.range / 2,
          (this.relAngle - this.defAngle) / this.stiffness + this.defAngle
        )
      );
    }

    this.absAngle = this.parent.absAngle + this.relAngle;
    this.x = this.parent.x + Math.cos(this.absAngle) * this.size;
    this.y = this.parent.y + Math.sin(this.absAngle) * this.size;

    if (iter) this.children.forEach(c => c.updateRelative(iter, flex));
  }

  draw(iter) {
    ctx.beginPath();
    ctx.moveTo(this.parent.x, this.parent.y);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    if (iter) this.children.forEach(c => c.draw(true));
  }

  follow(iter) {
    const px = this.parent.x, py = this.parent.y;
    const dist = Math.hypot(this.x - px, this.y - py);
    this.x = px + this.size * (this.x - px) / dist;
    this.y = py + this.size * (this.y - py) / dist;
    this.absAngle = Math.atan2(this.y - py, this.x - px);
    this.relAngle = this.absAngle - this.parent.absAngle;
    this.updateRelative(false, true);
    if (iter) this.children.forEach(c => c.follow(true));
  }
}

// ─────────────────────────────────────────────
//  LIMB SYSTEM
// ─────────────────────────────────────────────
class LimbSystem {
  constructor(end, length, speed, creature) {
    this.end      = end;
    this.length   = Math.max(1, length);
    this.creature = creature;
    this.speed    = speed;
    creature.systems.push(this);

    this.nodes = [];
    let node = end;
    for (let i = 0; i < length; i++) {
      this.nodes.unshift(node);
      node = node.parent;
      if (!node.isSegment) { this.length = i + 1; break; }
    }
    this.hip = this.nodes[0].parent;
  }

  moveTo(x, y) {
    this.nodes[0].updateRelative(true, true);
    let len = Math.max(0, Math.hypot(x - this.end.x, y - this.end.y) - this.speed);

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const ang  = Math.atan2(node.y - y, node.x - x);
      node.x = x + len * Math.cos(ang);
      node.y = y + len * Math.sin(ang);
      x = node.x; y = node.y; len = node.size;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      node.absAngle = Math.atan2(node.y - node.parent.y, node.x - node.parent.x);
      node.relAngle = node.absAngle - node.parent.absAngle;
      node.children.forEach(c => {
        if (!this.nodes.includes(c)) c.updateRelative(true, false);
      });
    }
  }
}

// ─────────────────────────────────────────────
//  LEG SYSTEM
// ─────────────────────────────────────────────
class LegSystem extends LimbSystem {
  constructor(end, length, speed, creature) {
    super(end, length, speed, creature);
    this.goalX       = end.x;
    this.goalY       = end.y;
    this.step        = 0;
    this.forwardness = 0;
    this.reach       = 0.9 * Math.hypot(this.end.x - this.hip.x, this.end.y - this.hip.y);

    let rel = this.creature.absAngle - Math.atan2(this.end.y - this.hip.y, this.end.x - this.hip.x);
    rel -= 2 * Math.PI * Math.floor(rel / (2 * Math.PI) + 0.5);
    this.swing       = -rel + (2 * (rel < 0) - 1) * Math.PI / 2;
    this.swingOffset = this.creature.absAngle - this.hip.absAngle;
  }

  update() {
    this.moveTo(this.goalX, this.goalY);

    if (this.step === 0) {
      if (Math.hypot(this.end.x - this.goalX, this.end.y - this.goalY) > 1) {
        this.step  = 1;
        this.goalX = this.hip.x + this.reach * Math.cos(this.swing + this.hip.absAngle + this.swingOffset)
                     + (2 * Math.random() - 1) * this.reach / 2;
        this.goalY = this.hip.y + this.reach * Math.sin(this.swing + this.hip.absAngle + this.swingOffset)
                     + (2 * Math.random() - 1) * this.reach / 2;
      }
    } else {
      const theta  = Math.atan2(this.end.y - this.hip.y, this.end.x - this.hip.x) - this.hip.absAngle;
      const dist   = Math.hypot(this.end.x - this.hip.x, this.end.y - this.hip.y);
      const fwd2   = dist * Math.cos(theta);
      const dF     = this.forwardness - fwd2;
      this.forwardness = fwd2;
      if (dF * dF < 1) {
        this.step  = 0;
        this.goalX = this.hip.x + (this.end.x - this.hip.x);
        this.goalY = this.hip.y + (this.end.y - this.hip.y);
      }
    }
  }
}

// ─────────────────────────────────────────────
//  CREATURE
// ─────────────────────────────────────────────
class Creature {
  constructor(x, y, angle, fAccel, fFric, fRes, fThresh, rAccel, rFric, rRes, rThresh) {
    this.x        = x;
    this.y        = y;
    this.absAngle = angle;
    this.fSpeed   = 0; this.fAccel  = fAccel; this.fFric  = fFric;
    this.fRes     = fRes; this.fThresh = fThresh;
    this.rSpeed   = 0; this.rAccel  = rAccel; this.rFric  = rFric;
    this.rRes     = rRes; this.rThresh = rThresh;
    this.children = [];
    this.systems  = [];
  }

  follow(x, y) {
    const dist  = Math.hypot(this.x - x, this.y - y);
    const angle = Math.atan2(y - this.y, x - this.x);

    // Forward speed
    let accel = this.fAccel;
    if (this.systems.length > 0) {
      let grounded = 0;
      this.systems.forEach(s => { grounded += (s.step === 0); });
      accel *= grounded / this.systems.length;
    }
    this.fSpeed += accel * (dist > this.fThresh);
    this.fSpeed *= 1 - this.fRes;
    this.speed   = Math.max(0, this.fSpeed - this.fFric);

    // Rotation
    let dif = this.absAngle - angle;
    dif -= 2 * Math.PI * Math.floor(dif / (2 * Math.PI) + 0.5);
    if (Math.abs(dif) > this.rThresh && dist > this.fThresh) {
      this.rSpeed -= this.rAccel * (2 * (dif > 0) - 1);
    }
    this.rSpeed *= 1 - this.rRes;
    if (Math.abs(this.rSpeed) > this.rFric) {
      this.rSpeed -= this.rFric * (2 * (this.rSpeed > 0) - 1);
    } else {
      this.rSpeed = 0;
    }

    // Apply movement
    this.absAngle += this.rSpeed;
    this.absAngle -= 2 * Math.PI * Math.floor(this.absAngle / (2 * Math.PI) + 0.5);
    this.x += this.speed * Math.cos(this.absAngle);
    this.y += this.speed * Math.sin(this.absAngle);

    this.absAngle += Math.PI;
    this.children.forEach(c => c.follow(true));
    this.systems.forEach(s => s.update());
    this.absAngle -= Math.PI;
    this.draw(true);
  }

  draw(iter) {
    const r = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r,
      Math.PI / 4 + this.absAngle,
      7 * Math.PI / 4 + this.absAngle
    );
    ctx.moveTo(
      this.x + r * Math.cos(7 * Math.PI / 4 + this.absAngle),
      this.y + r * Math.sin(7 * Math.PI / 4 + this.absAngle)
    );
    ctx.lineTo(
      this.x + r * Math.cos(this.absAngle) * Math.SQRT2,
      this.y + r * Math.sin(this.absAngle) * Math.SQRT2
    );
    ctx.lineTo(
      this.x + r * Math.cos(Math.PI / 4 + this.absAngle),
      this.y + r * Math.sin(Math.PI / 4 + this.absAngle)
    );
    ctx.stroke();
    if (iter) this.children.forEach(c => c.draw(true));
  }
}

// ─────────────────────────────────────────────
//  SETUP LIZARD
// ─────────────────────────────────────────────
function setupLizard(size, legs, tail) {
  const s = size;
  const critter = new Creature(
    window.innerWidth / 2, window.innerHeight / 2, 0,
    s * 10, s * 2, 0.5, 16, 0.5, 0.085, 0.5, 0.3
  );
  let spinal = critter;

  // Neck
  for (let i = 0; i < 6; i++) {
    spinal = new Segment(spinal, s * 4, 0, Math.PI * 2 / 3, 1.1);
    for (let ii = -1; ii <= 1; ii += 2) {
      let node = new Segment(spinal, s * 3, ii, 0.1, 2);
      for (let iii = 0; iii < 3; iii++) node = new Segment(node, s * 0.1, -ii * 0.1, 0.1, 2);
    }
  }

  // Torso + legs
  for (let i = 0; i < legs; i++) {
    if (i > 0) {
      for (let ii = 0; ii < 6; ii++) {
        spinal = new Segment(spinal, s * 4, 0, 1.571, 1.5);
        for (let iii = -1; iii <= 1; iii += 2) {
          let node = new Segment(spinal, s * 3, iii * 1.571, 0.1, 1.5);
          for (let iv = 0; iv < 3; iv++) node = new Segment(node, s * 3, -iii * 0.3, 0.1, 2);
        }
      }
    }
    for (let ii = -1; ii <= 1; ii += 2) {
      let node = new Segment(spinal, s * 12, ii * 0.785, 0, 8);
      node = new Segment(node, s * 16, -ii * 0.785, Math.PI * 2, 1);
      node = new Segment(node, s * 16,  ii * 1.571,  Math.PI,    2);
      for (let iii = 0; iii < 4; iii++) {
        new Segment(node, s * 4, (iii / 3 - 0.5) * 1.571, 0.1, 4);
      }
      new LegSystem(node, 3, s * 12, critter);
    }
  }

  // Tail
  for (let i = 0; i < tail; i++) {
    spinal = new Segment(spinal, s * 4, 0, Math.PI * 2 / 3, 1.1);
    for (let ii = -1; ii <= 1; ii += 2) {
      let node = new Segment(spinal, s * 3, ii, 0.1, 2);
      for (let iii = 0; iii < 3; iii++) {
        node = new Segment(node, s * 3 * (tail - i) / tail, -ii * 0.1, 0.1, 2);
      }
    }
  }

  return critter;
}

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
const creature = setupLizard(2.5, 4, 10);

function drawVignette() {
  const grd = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.85
  );
  grd.addColorStop(0, 'rgba(14,14,15,0)');
  grd.addColorStop(1, 'rgba(14,14,15,.6)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCrosshair() {
  ctx.save();
  ctx.strokeStyle = 'rgba(184,188,200,.12)';
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  ctx.moveTo(mx, 0);             ctx.lineTo(mx, canvas.height);
  ctx.moveTo(0, my);             ctx.lineTo(canvas.width, my);
  ctx.stroke();
  ctx.restore();
}

function animate() {
  // Trail effect
  ctx.fillStyle = 'rgba(14,14,15,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCrosshair();

  ctx.strokeStyle = '#9aa0b0';
  ctx.lineWidth   = 1;
  creature.follow(
    Input.mouse.x || canvas.width  / 2,
    Input.mouse.y || canvas.height / 2
  );

  drawVignette();
  requestAnimationFrame(animate);
}

animate();

// ─────────────────────────────────────────────
//  PANELS
// ─────────────────────────────────────────────
document.querySelectorAll('[data-panel]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + link.dataset.panel).classList.add('active');
  });
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('panel-' + btn.dataset.close).classList.remove('active');
  });
});

document.querySelectorAll('.panel-bg').forEach(bg => {
  bg.addEventListener('click', () => bg.closest('.panel').classList.remove('active'));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
});