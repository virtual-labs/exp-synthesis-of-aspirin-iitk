// script.js
// Aspirin Synthesis Simulation – Mentor-corrected version
// FIX: flasks now MOVE + TILT + POUR (no flying chemicals)

let soundEnabled = true;
function playSound(sound) {
  if (!soundEnabled || !sound) return;
  sound.currentTime = 0;
  sound.play();
}

class AspirinSynthesisSim {
  constructor() {
    

    // --- DOM references (must match your HTML) ---
    this.flasks = [
      document.getElementById('flask1'),
      document.getElementById('flask2'),
      document.getElementById('flask3')
    ];
    this.chemicalColors = [
  'rgba(255, 105, 180, 0.7)', // Chemical 1 – pink
  'rgba(0, 180, 255, 0.7)',   // Chemical 2 – blue
  'rgba(255, 81, 0, 0.7)'    // Chemical 3 – yellow
];

    this.beaker = document.getElementById('beaker');
    this.buchnerFunnel = document.getElementById('buchnerFunnel');
    this.waterBath = document.getElementById('waterBath');
    this.iceTub = document.getElementById('icetub');
    this.instructions = Array.from(document.querySelectorAll('#instructions li'));
    this.tooltip = document.getElementById('tooltip');
    this.table = document.querySelector('.table');
    this.instructionPanel = document.querySelector('.instruction-panel');

    // Canvas (overlay for streams & particles)
    this.canvas = document.getElementById('labCanvas');
    if (!this.canvas) {
      // create defensively if missing
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'labCanvas';
      document.body.appendChild(this.canvas);
    }
    this.ctx = this.canvas.getContext('2d');

    // Ensure table exists
    if (!this.table) {
      console.warn('No .table element found. Beaker placement may be off.');
    } else {
      // make table a positioned container so absolute beaker stays inside it
      const tStyle = window.getComputedStyle(this.table);
      if (tStyle.position === 'static' || !tStyle.position) {
        this.table.style.position = 'relative';
      }
    }

    // Set safe layout z-indexes so header & instruction panel remain visible
    if (this.instructionPanel) {
      this.instructionPanel.style.zIndex = 50;
      this.instructionPanel.style.position = this.instructionPanel.style.position || 'relative';
    }
    // header likely already high; ensure canvas is behind interactive DOM
    this.canvas.style.position = 'fixed';
    this.canvas.style.left = '0';
    this.canvas.style.top = '0';
    this.canvas.style.zIndex = '0';
    this.canvas.style.pointerEvents = 'none'; // don't block clicks

    // Raise interactive elements (so they sit above canvas)
    const interactiveIds = ['flask1','flask2','flask3','beaker','buchnerFunnel','waterBath','icetub'];
    interactiveIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.zIndex = 10;
    });

    // --- state ---
    // step mapping:
    // 0: pour flask1 (salicylic)
    // 1: pour flask2 (acetic anhydride)
    // 2: pour flask3 (sulfuric acid)
    // 3: stir (click beaker)
    // 4: heating (auto)
    // 5: place on Buchner funnel (filter)
    // 6: return to table then place in water bath (heat)
    // 7: return to table then place in ice tub (crystallize)
    // 8: observation complete
    this.currentStep = 0;
    this.addedChemicals = 0;
    this.isPouring = false;
    this.isStirring = false;

    // beakerFill: persistent fill (pixels relative to beaker rect)
    this.beakerFill = { pixels: 0 };

    // particles array for particle animation
    this.particles = [];

    // pointer drag for beaker
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    // sounds (optional; silent if missing)
    this.sounds = {
      pour: this._safeAudio('sounds/pour.mp3'),
      heat: this._safeAudio('sounds/heat.mp3'),
      filter: this._safeAudio('sounds/filter.mp3'),
      crystal: this._safeAudio('sounds/crystal.mp3')
    };

    // speech
    this.synth = window.speechSynthesis;

    // Bind events + start render loop
    this._bindEvents();
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    this._updateInstructionsUI();
    this._startRenderLoop();
  }

  // create audio safely
  _safeAudio(path) {
    try { return new Audio(path); } catch(e) { return null; }
  }

  // -------------------------
  // Event binding
  // -------------------------
  _bindEvents() {
    // Flask behavior: hover tooltip + click pour
    this.flasks.forEach((f, idx) => {
      if (!f) return;
      f.style.cursor = 'pointer';
      f.addEventListener('mouseenter', () => this._showTooltipFor(f));
      f.addEventListener('mouseleave', () => this._hideTooltip());
      f.addEventListener('click', () => this._onFlaskClick(idx));
    });

    // Beaker hover, click for stirring, pointer drag for moving
    if (this.beaker) {
      this.beaker.style.cursor = 'grab';
      this.beaker.addEventListener('mouseenter', () => this._showTooltipFor(this.beaker));
      this.beaker.addEventListener('mouseleave', () => this._hideTooltip());
      this.beaker.addEventListener('click', () => this._onBeakerClick());
      // pointer drag (works for mouse & touch)
      this.beaker.addEventListener('pointerdown', (ev) => this._startPointerDrag(ev));
      window.addEventListener('pointermove', (ev) => this._onPointerMove(ev));
      window.addEventListener('pointerup', (ev) => this._stopPointerDrag(ev));
    }

    // Equipment hover & click description
    [this.buchnerFunnel, this.waterBath, this.iceTub].forEach(el => {
      if (!el) return;
      el.addEventListener('mouseenter', () => this._showTooltipFor(el));
      el.addEventListener('mouseleave', () => this._hideTooltip());
      el.addEventListener('click', () => this._describeEquipment(el));
    });

    // Allow dropping beaker onto equipment via pointer drag (we'll check overlap on pointer up)
    // Also support legacy drag/drop for devices if user wants (beaker draggable attr already set)
    document.addEventListener('dragover', e => e.preventDefault());
    [this.buchnerFunnel, this.waterBath, this.iceTub].forEach(el => {
      if (!el) return;
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        // place beaker at center of element (inside table)
        this._placeBeakerOnElement(el);
        this._handleEquipAction(el);
      });
    });
  }

  // -------------------------
  // Tooltip & speech
  // -------------------------
  _showTooltipFor(el) {
    if (!this.tooltip || !el) return;
    const name = this._nameFromEl(el);
    const desc = this._descForName(name);
    this.tooltip.style.display = 'block';
    this.tooltip.style.position = 'fixed';
    const r = el.getBoundingClientRect();
    // position tooltip above element and centered
    this.tooltip.style.left = Math.max(8, r.left + r.width / 2) + 'px';
    this.tooltip.style.top = Math.max(8, r.top - 56) + 'px';
    this.tooltip.innerHTML = `<strong style="color:#7fd3ff">${name}</strong><div style="font-size:12px;margin-top:6px">${desc}</div>`;
    this._speakShort(`${name}. ${desc}`);
  }
  _hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.style.display = 'none';
  }
  _nameFromEl(el) {
    if (!el) return 'Unknown';
    return el.dataset?.name || el.querySelector?.('img')?.dataset?.name || el.alt || 'Unknown';
  }
  _descForName(name) {
    switch ((name||'').toLowerCase()) {
      case 'salicylic acid': return 'Starting material that becomes aspirin after acetylation.';
      case 'acetic anhydride': return 'Provides the acetyl group to salicylic acid.';
      case 'sulfuric acid': return 'Strong acid used in small amounts as a catalyst.';
      case 'buchner funnel': return 'Used for vacuum filtration of solids.';
      case 'water bath machine': case 'water bath': return 'Provides controlled heating.';
      case 'ice bath': return 'Used to cool and crystallize the product.';
      case 'beaker': return 'Container where chemicals are mixed.';
      default: return 'Laboratory equipment.';
    }
  }
  // _speakShort(text) {
  //   if (!('speechSynthesis' in window)) return;
  //   try {
  //     if (this.synth.speaking) this.synth.cancel();
  //     const u = new SpeechSynthesisUtterance(text);
  //     this.synth.speak(u);
  //   } catch(e) {}
  // }
  _speakShort(text) {
  if (!soundEnabled) return;   // ✅ ADD THIS LINE
  if (!('speechSynthesis' in window)) return;
  try {
    if (this.synth.speaking) this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    this.synth.speak(u);
  } catch(e) {}
}


  // -------------------------
  // Instructions UI
  // -------------------------
  _updateInstructionsUI() {
    if (!Array.isArray(this.instructions)) return;
    this.instructions.forEach((li, idx) => {
      li.classList.remove('completed','current','upcoming');
      if (idx < this.currentStep) li.classList.add('completed');
      else if (idx === this.currentStep) li.classList.add('current');
      else li.classList.add('upcoming');
    });
  }

  // -------------------------
  // Flask pour click handler
  // -------------------------
  _onFlaskClick(index) {
    // require strict order
    if (this.isPouring || this.isStirring) return;
    if (index !== this.currentStep) {
      this._showFeedback('Please follow steps in order.');
      return;
    }
    const flaskEl = this.flasks[index];
    if (!flaskEl) return;

    // visual disabled
    flaskEl.classList.add('disabled');
    const name = this._nameFromEl(flaskEl);
    this._speakShort(`${name} — pouring`);

    // start pour animation (tilt RIGHT, stream drawn on canvas)
    const color = this.chemicalColors[index];
this._startPour(flaskEl, color, 3000, () => {

      // after each pour completes:
      this.addedChemicals += 1;
      this.currentStep += 1;
      this._updateInstructionsUI();
      this._showFeedback(`${name} added to beaker`, 'success');

      if (this.addedChemicals >= 3) {
        // shrink beaker and place it safely on table
        setTimeout(() => {
          this._shrinkBeakerAndPlaceOnTable();
          this._showFeedback('All chemicals added — beaker ready. Click to stir.', 'success');
          this._speakShort('All chemicals added. Stir the mixture by clicking the beaker.');
          // advance to the stir step (currentStep already moved to 3 by increments)
          // ensure instructions updated
          this._updateInstructionsUI();
        }, 300);
      }
    });
  }

  // -------------------------
  // Pour implementation
  // - tilt flask to RIGHT (positive rotate)
  // - draw stream during pour
  // - update persistent beakerFill only when pour finishes (so fill doesn't appear immediately)
  // -------------------------
//  _startPour(flaskEl, color, duration = 3000, onFinished = null) {

//     if (!flaskEl || !this.beaker) return;
//     if (this.isPouring) return;
//     this.isPouring = true;

//     // store old transform so we can restore
//     const oldTransform = flaskEl.style.transform || '';

//     // Tilt RIGHT
//     flaskEl.style.transition = `transform ${duration/1000}s ease-in-out`;
//     flaskEl.style.transformOrigin = 'center top';
//     flaskEl.style.transform = 'rotate(50deg)';

//     // compute rects at start
//     const srcRect = flaskEl.getBoundingClientRect();
//     const beakerRect = this.beaker.getBoundingClientRect();

//     // compute total fill increment for this pour: e.g., 1/3 of beaker's max fill
//     const maxFill = Math.max(4, Math.floor(beakerRect.height * 0.75));
//     // determine incremental contribution: evenly split across 3 pours
//     const pourContribution = Math.max(4, Math.floor(maxFill / 3));

//     const startTime = performance.now();
//     // temporary visual fill for the stream (not committed to beakerFill until finish)
//     const tempFill = { pixels: 0 };

//     const frame = (time) => {
//       const t = Math.min(1, (time - startTime) / duration);

//       // clear canvas each frame
//       this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);

//       // Draw stream: quadratic curve from flask lip to beaker top
//       const sx = srcRect.left + srcRect.width * 0.5;
//       const sy = srcRect.top + srcRect.height * 0.6;
//       const ex = beakerRect.left + beakerRect.width * 0.5;
//       const ey = beakerRect.top + beakerRect.height * 0.28;
//       const cx = sx + (ex - sx) * 0.5 + 40 * Math.sin(t * Math.PI * 2);
//       const cy = sy + (ey - sy) * 0.3;

//       this.ctx.beginPath();
//       this.ctx.lineWidth = Math.max(4, 6 * (1 - t * 0.6));
//       this.ctx.strokeStyle = color;

//       this.ctx.moveTo(sx, sy);
//       // draw quadratic using control point (approx)
//       const curX = sx + (ex - sx) * t;
//       const curY = sy + (ey - sy) * t;
//       this.ctx.quadraticCurveTo(cx, cy, curX, curY);
//       this.ctx.stroke();

//       // small stream droplet at end
//       this.ctx.beginPath();
//       this.ctx.fillStyle = color;

//       this.ctx.arc(curX, curY, Math.max(3, 6 * (1 - t * 0.6)), 0, Math.PI*2);
//       this.ctx.fill();

//       // draw temporary beaker fill rising proportionally during pour (for realism)
//       tempFill.pixels = Math.min(pourContribution, Math.floor(pourContribution * t));
//       // persistent existing fill remains below
//       const totalFillPixels = Math.min(maxFill, (this.beakerFill.pixels || 0) + tempFill.pixels);
//       const fillLeft = beakerRect.left + 4;
//       const fillWidth = Math.max(4, beakerRect.width - 8);
//       const fillTop = beakerRect.bottom - totalFillPixels;
//       this.ctx.fillStyle = 'rgba(255, 238, 0, 0.28)';
//       this.ctx.fillRect(fillLeft, fillTop, fillWidth, totalFillPixels);

//       // render particles (small bubbles above beaker if pour ongoing)
//       this._drawParticlesOnOverlay();

//       if (t < 1) {
//         requestAnimationFrame(frame);
//       } else {
//         // finalize pour
//         // commit persistent beaker fill
//         this.beakerFill.pixels = Math.min(maxFill, (this.beakerFill.pixels || 0) + pourContribution);
//         // clear canvas of stream but keep overlay render loop running (persistent fill drawn by render loop too)
//         this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
//         // restore flask transform
//         flaskEl.style.transform = oldTransform || '';
//         // play pour sound if available
//         playSound(this.sounds.pour);

//         this.isPouring = false;
//         if (typeof onFinished === 'function') onFinished();
//       }
//     };

//     requestAnimationFrame(frame);
//   }
// _startPour(flaskEl, color, duration = 3000, onFinished = null) {
//   if (!flaskEl || !this.beaker || this.isPouring) return;
//   this.isPouring = true;

//   const beakerRect = this.beaker.getBoundingClientRect();
//   const flaskRect = flaskEl.getBoundingClientRect();

//   const originalTransform = flaskEl.style.transform || '';
//   flaskEl.style.zIndex = 20;

//   const dx = beakerRect.left - flaskRect.left + 30;
//   const dy = beakerRect.top - flaskRect.top - 40;
// flaskEl.style.transformOrigin = '40% 15%';

//   flaskEl.style.transition = 'transform 0.8s ease';
//   flaskEl.style.transform = `translate(${dx}px, ${dy}px)`;

//   setTimeout(() => {
//     flaskEl.style.transform += ' rotate(-65deg) translateY(4px)';
//     playSound(this.sounds.pour);

//     this._drawPourStream(flaskEl, color, duration);

//     setTimeout(() => {
//       flaskEl.style.transform = originalTransform;
//       flaskEl.style.zIndex = '';

//       const beakerRectNow = this.beaker.getBoundingClientRect();
//       const maxFill = Math.floor(beakerRectNow.height * 0.75);
//       this.beakerFill.pixels = Math.min(
//         maxFill,
//         this.beakerFill.pixels + Math.floor(maxFill / 3)
//       );

//       this.isPouring = false;
//       this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

//       if (onFinished) onFinished();
//     }, duration);
//   }, 900);
// }
// _drawPourStream(flaskEl, color, duration) {
//   const startTime = performance.now();

//   const animate = (time) => {
//     const t = Math.min(1, (time - startTime) / duration);
//     this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

//     const f = flaskEl.getBoundingClientRect();
//     const b = this.beaker.getBoundingClientRect();

//     const sx = f.left + f.width / 2;
//     const sy = f.bottom;
//     const ex = b.left + b.width / 2;
//     const ey = b.top + 25;

//     this.ctx.beginPath();
//     this.ctx.strokeStyle = color;
//     this.ctx.lineWidth = 5;
//     this.ctx.moveTo(sx, sy);
//     this.ctx.quadraticCurveTo(sx + 30, sy + 60, ex, ey);
//     this.ctx.stroke();

//     if (t < 1 && this.isPouring) {
//       requestAnimationFrame(animate);
//     }
//   };
//   requestAnimationFrame(animate);
// }
// _
_startPour(flaskEl, color, duration = 3000, onFinished = null) {
  if (!flaskEl || !this.beaker || this.isPouring) return;
  this.isPouring = true;

  const beakerRect = this.beaker.getBoundingClientRect();
  const flaskRect = flaskEl.getBoundingClientRect();
  const originalTransform = flaskEl.style.transform || '';
  flaskEl.style.zIndex = 20;

  const dx = beakerRect.left - flaskRect.left + 30;
  const dy = beakerRect.top - flaskRect.top - 40;

  flaskEl.style.transformOrigin = '40% 15%'; // adjust pivot
  flaskEl.style.transition = 'transform 0.8s ease';
  flaskEl.style.transform = `translate(${dx}px, ${dy}px)`;

  setTimeout(() => {
    flaskEl.style.transform += ' rotate(-65deg)';
    playSound(this.sounds.pour);

    // Animate pour AND liquid rise inside beaker
    this._drawPourStream(flaskEl, color, duration, true);

    setTimeout(() => {
      flaskEl.style.transform = originalTransform;
      flaskEl.style.zIndex = '';

      // Ensure beaker reaches max fill after pour
      const maxFill = Math.floor(beakerRect.height * 0.75);
      this.beakerFill.pixels = Math.min(
        maxFill,
        this.beakerFill.pixels + Math.floor(maxFill / 3)
      );

      this.isPouring = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (onFinished) onFinished();
    }, duration);
  }, 900);
}

_drawPourStream(flaskEl, color, duration, animateBeaker = false) {
  const startTime = performance.now();
  const initialFill = this.beakerFill.pixels;
  const beakerRect = this.beaker.getBoundingClientRect();
  const maxFill = Math.floor(beakerRect.height * 0.75);

  const animate = (time) => {
    const t = Math.min(1, (time - startTime) / duration);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const f = flaskEl.getBoundingClientRect();
    const b = this.beaker.getBoundingClientRect();

    // Draw pouring stream
    const sx = f.left + f.width / 2;
    const sy = f.bottom;
    const ex = b.left + b.width / 2;
    const ey = b.top + 25;

    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 5;
    this.ctx.moveTo(sx, sy);
    this.ctx.quadraticCurveTo(sx + 30, sy + 60, ex, ey);
    this.ctx.stroke();

    // Animate liquid **inside the beaker**
    if (animateBeaker) {
      const rise = initialFill + Math.floor((maxFill - initialFill) * t);
      this.beakerFill.pixels = rise;

      // Draw the beaker liquid
      const beakerLeft = b.left;
      const beakerTop = b.top + b.height - rise;
      const beakerWidth = b.width;
      const beakerHeight = rise;

      this.ctx.fillStyle = color;
      this.ctx.fillRect(beakerLeft, beakerTop, beakerWidth, beakerHeight);
    }

    if (t < 1 && this.isPouring) {
      requestAnimationFrame(animate);
    }
  };
  requestAnimationFrame(animate);
}

// _startPour(flaskEl, color, duration = 3000, onFinished = null) {
//   if (!flaskEl || !this.beaker || this.isPouring) return;
//   this.isPouring = true;

//   const beakerRect = this.beaker.getBoundingClientRect();
//   const flaskRect = flaskEl.getBoundingClientRect();

//   // save original state
//   const originalTransform = flaskEl.style.transform || '';
//   flaskEl.style.zIndex = 20;

//   // move flask mouth near beaker opening
//   const dx = beakerRect.left - flaskRect.left - flaskRect.width / 2;
//   const dy = beakerRect.top - flaskRect.top - 40;

//   flaskEl.style.transition = 'transform 0.8s ease';
//   flaskEl.style.transform = `translate(${dx}px, ${dy}px)`;

//   // wait for movement
//   setTimeout(() => {
//     // tilt flask toward beaker
//     flaskEl.style.transform += ' rotate(45deg)';
//     playSound(this.sounds.pour);

//     // draw liquid stream
//     this._drawPourStream(flaskEl, color, duration);

//     // finish pouring
//     setTimeout(() => {
//       flaskEl.style.transform = originalTransform;
//       flaskEl.style.zIndex = '';

//       // update beaker fill AFTER pour completes
//       const beakerRectNow = this.beaker.getBoundingClientRect();
//       const maxFill = Math.floor(beakerRectNow.height * 0.75);
//       this.beakerFill.pixels = Math.min(
//         maxFill,
//         this.beakerFill.pixels + Math.floor(maxFill / 3)
//       );

//       this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
//       this.isPouring = false;

//       if (onFinished) onFinished();
//     }, duration);
//   }, 900);
// }
// _drawPourStream(flaskEl, color, duration) {
//   const startTime = performance.now();

//   const animate = (time) => {
//     const t = Math.min(1, (time - startTime) / duration);
//     this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

//     const flaskRect = flaskEl.getBoundingClientRect();
//     const beakerRect = this.beaker.getBoundingClientRect();

//     // stream start (flask mouth)
//     const sx = flaskRect.left + flaskRect.width / 2;
//     const sy = flaskRect.bottom - 5;

//     // stream end (inside beaker)
//     const ex = beakerRect.left + beakerRect.width / 2;
//     const ey = beakerRect.top + 25;

//     this.ctx.beginPath();
//     this.ctx.lineWidth = 5;
//     this.ctx.strokeStyle = color;
//     this.ctx.moveTo(sx, sy);

//     // curve adjusted to fall INTO beaker
//     this.ctx.quadraticCurveTo(
//       sx - 30,
//       sy + 60,
//       ex,
//       ey
//     );

//     this.ctx.stroke();

//     if (t < 1 && this.isPouring) {
//       requestAnimationFrame(animate);
//     }
//   };

//   requestAnimationFrame(animate);
// }
// _startPour(flaskEl, color, duration = 3000, onFinished = null) {
//   if (!flaskEl || !this.beaker || this.isPouring) return;
//   this.isPouring = true;

//   const beakerRect = this.beaker.getBoundingClientRect();
//   const flaskRect = flaskEl.getBoundingClientRect();

//   // save original state
//   const originalTransform = flaskEl.style.transform || '';
//   flaskEl.style.zIndex = 20;

//   // center flask exactly above beaker opening
//   const dx =
//     (beakerRect.left + beakerRect.width / 2) -
//     (flaskRect.left + flaskRect.width / 2);

//   // place flask just above beaker
//   const dy =
//     beakerRect.top - flaskRect.top - flaskRect.height + 10;

//   flaskEl.style.transition = 'transform 0.8s ease';
//   flaskEl.style.transform = `translate(${dx}px, ${dy}px)`;

//   // wait for movement to finish
//   setTimeout(() => {
//     // tilt slightly toward beaker
//     flaskEl.style.transform += ' rotate(-35deg)';
//     playSound(this.sounds.pour);

//     // draw liquid stream
//     this._drawPourStream(flaskEl, color, duration);

//     // finish pouring
//     setTimeout(() => {
//       flaskEl.style.transform = originalTransform;
//       flaskEl.style.zIndex = '';

//       // update beaker fill AFTER pour completes
//       const beakerRectNow = this.beaker.getBoundingClientRect();
//       const maxFill = Math.floor(beakerRectNow.height * 0.75);
//       this.beakerFill.pixels = Math.min(
//         maxFill,
//         this.beakerFill.pixels + Math.floor(maxFill / 3)
//       );

//       this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
//       this.isPouring = false;

//       if (onFinished) onFinished();
//     }, duration);
//   }, 900);
// }
// _startPour(flaskEl, color, duration = 3000, onFinished = null) {
//   if (!flaskEl || !this.beaker || this.isPouring) return;
//   this.isPouring = true;

//   const beakerRect = this.beaker.getBoundingClientRect();
//   const flaskRect = flaskEl.getBoundingClientRect();

//   // save original styles
//   const original = {
//     position: flaskEl.style.position,
//     left: flaskEl.style.left,
//     top: flaskEl.style.top,
//     transform: flaskEl.style.transform,
//     zIndex: flaskEl.style.zIndex
//   };

//   // lift flask out of layout to avoid clipping
//   flaskEl.style.position = 'fixed';
//   flaskEl.style.left = `${flaskRect.left}px`;
//   flaskEl.style.top = `${flaskRect.top}px`;
//   flaskEl.style.zIndex = 9999;

//   // center flask above beaker
//   const dx =
//     (beakerRect.left + beakerRect.width / 2) -
//     (flaskRect.left + flaskRect.width / 2);

//   const dy =
//     beakerRect.top - flaskRect.top - flaskRect.height + 10;

//   flaskEl.style.transition = 'transform 0.8s ease';
//   flaskEl.style.transform = `translate(${dx}px, ${dy}px)`;

//   // wait for movement
//   setTimeout(() => {
//     // tilt flask slightly
//     flaskEl.style.transform += ' rotate(-35deg)';
//     playSound(this.sounds.pour);

//     // pour stream
//     this._drawPourStream(flaskEl, color, duration);

//     // finish pouring
//     setTimeout(() => {
//       // restore original styles
//       flaskEl.style.position = original.position;
//       flaskEl.style.left = original.left;
//       flaskEl.style.top = original.top;
//       flaskEl.style.transform = original.transform;
//       flaskEl.style.zIndex = original.zIndex;

//       // update beaker fill
//       const beakerRectNow = this.beaker.getBoundingClientRect();
//       const maxFill = Math.floor(beakerRectNow.height * 0.75);
//       this.beakerFill.pixels = Math.min(
//         maxFill,
//         this.beakerFill.pixels + Math.floor(maxFill / 3)
//       );

//       this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
//       this.isPouring = false;

//       if (onFinished) onFinished();
//     }, duration);
//   }, 900);
// }
// _startPour(flaskEl, color, duration = 3000, onFinished = null) {
//   if (!flaskEl || !this.beaker || this.isPouring) return;
//   this.isPouring = true;

//   const beakerRect = this.beaker.getBoundingClientRect();
//   const flaskRect = flaskEl.getBoundingClientRect();

//   // save original styles
//   const original = {
//     position: flaskEl.style.position,
//     left: flaskEl.style.left,
//     top: flaskEl.style.top,
//     transform: flaskEl.style.transform,
//     transition: flaskEl.style.transition,
//     zIndex: flaskEl.style.zIndex
//   };

//   // take flask out of layout (avoid clipping)
//   flaskEl.style.position = 'fixed';
//   flaskEl.style.left = `${flaskRect.left}px`;
//   flaskEl.style.top = `${flaskRect.top}px`;
//   flaskEl.style.zIndex = 9999;
//   flaskEl.style.transition = 'left 0.8s ease, top 0.8s ease';

//   // target position: centered just above beaker
//   const targetLeft =
//     beakerRect.left +
//     beakerRect.width / 2 -
//     flaskRect.width / 2;

//   const targetTop =
//     beakerRect.top -
//     flaskRect.height +
//     10;

//   // move flask
//   setTimeout(() => {
//     flaskEl.style.left = `${targetLeft}px`;
//     flaskEl.style.top = `${targetTop}px`;
//   }, 50);

//   // tilt + pour
//   setTimeout(() => {
//     flaskEl.style.transform = 'rotate(-35deg)';
//     playSound(this.sounds.pour);

//     this._drawPourStream(flaskEl, color, duration);

//     // finish pouring
//     setTimeout(() => {
//       // restore everything
//       flaskEl.style.position = original.position;
//       flaskEl.style.left = original.left;
//       flaskEl.style.top = original.top;
//       flaskEl.style.transform = original.transform;
//       flaskEl.style.transition = original.transition;
//       flaskEl.style.zIndex = original.zIndex;

//       // update beaker fill
//       const beakerRectNow = this.beaker.getBoundingClientRect();
//       const maxFill = Math.floor(beakerRectNow.height * 0.75);
//       this.beakerFill.pixels = Math.min(
//         maxFill,
//         this.beakerFill.pixels + Math.floor(maxFill / 3)
//       );

//       this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
//       this.isPouring = false;

//       if (onFinished) onFinished();
//     }, duration);
//   }, 900);
// }

// _drawPourStream(flaskEl, color, duration) {
//   const startTime = performance.now();

//   const animate = (time) => {
//     const t = Math.min(1, (time - startTime) / duration);
//     this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

//     const flaskRect = flaskEl.getBoundingClientRect();
//     const beakerRect = this.beaker.getBoundingClientRect();

//     // stream start: flask mouth
//     const sx = flaskRect.left + flaskRect.width / 2;
//     const sy = flaskRect.bottom - 8;

//     // stream end: beaker center
//     const ex = beakerRect.left + beakerRect.width / 2;
//     const ey = beakerRect.top + 25;

//     this.ctx.beginPath();
//     this.ctx.lineWidth = 5;
//     this.ctx.strokeStyle = color;
//     this.ctx.moveTo(sx, sy);

//     // gentle curve straight into beaker
//     this.ctx.quadraticCurveTo(
//       sx,
//       sy + 60,
//       ex,
//       ey
//     );

//     this.ctx.stroke();

//     if (t < 1 && this.isPouring) {
//       requestAnimationFrame(animate);
//     }
//   };

//   requestAnimationFrame(animate);
// }

  // -------------------------
  // Stirring (beaker click)
  // -------------------------
  _onBeakerClick() {
    if (this.currentStep !== 3) {
      if (this.currentStep < 3) this._showFeedback('Add all three chemicals first.');
      else this._showFeedback('Follow the next instruction on the right.');
      return;
    }
    if (this.isStirring) return;
    this.isStirring = true;
    this._showFeedback('Stirring...');
    this._speakShort('Stirring the mixture.');

    const el = this.beaker;
    const start = performance.now();
    const duration = 1600;
    const animate = (time) => {
      const t = (time - start) / duration;
      if (t >= 1) {
        el.style.transform = '';
        this.isStirring = false;
        // auto-heat step
        this.currentStep = 4;
        this._updateInstructionsUI();
        this._autoHeatSequence();
        return;
      }
      const angle = Math.sin(t * Math.PI * 4) * 4; // subtle oscillation
      el.style.transform = `rotate(${angle}deg)`;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  _autoHeatSequence() {
    this._showFeedback('Heating (simulated) in progress...', 'success');
    playSound(this.sounds.heat);

    // start heat particles for beaker
    this._startParticlesAround(this.beaker, 'heat', 2800, () => {
      // after heat done, next step is filtration (Buchner)
      this.currentStep = 5;
      this._updateInstructionsUI();
      this._showFeedback('Heating done. Place beaker on the Buchner funnel to filter.', 'success');
      this._speakShort('Heating done. Place the beaker on the Buchner funnel to filter.');
    });
  }

  // -------------------------
  // Shrink beaker & keep on table
  // -------------------------
  _shrinkBeakerAndPlaceOnTable() {
    if (!this.beaker) return;
    // shrink visually
    this.beaker.style.transition = 'width 0.35s ease, height 0.35s ease, transform 0.35s ease';
    // set reasonable small size preserving aspect
    this.beaker.style.width = '92px';
    this.beaker.style.height = '136px';
    this.beaker.style.transform = 'translateZ(0)'; // ensure render
    // ensure absolute inside table
    if (this.table) {
      // append to table container so left/top are relative to .table
      try {
        this.table.appendChild(this.beaker);
      } catch(e) {}
      // compute center-ish coordinates inside table
      const tr = this.table.getBoundingClientRect();
      const left = Math.round(tr.width * 0.45); // 45% from left of table
      const top = Math.round(tr.height * 0.55); // slightly above bottom
      // position relative to table
      this.beaker.style.position = 'absolute';
      this.beaker.style.left = `${left}px`;
      this.beaker.style.top = `${top}px`;
      // ensure it sits above table background
      this.beaker.style.zIndex = 12;
    } else {
      // fallback: keep current location but ensure visible
      this.beaker.style.position = 'relative';
    }
  }

  // -------------------------
  // Pointer drag (beaker)
  // -------------------------
  _startPointerDrag(ev) {
    if (!this.beaker) return;
    this.isDragging = true;
    const r = this.beaker.getBoundingClientRect();
    this.dragOffset.x = ev.clientX - r.left;
    this.dragOffset.y = ev.clientY - r.top;
    // ensure absolute
    const comp = window.getComputedStyle(this.beaker);
    if (comp.position !== 'absolute' && comp.position !== 'fixed') {
      // position relative to page
      this.beaker.style.position = 'absolute';
      this.beaker.style.left = `${r.left + window.scrollX}px`;
      this.beaker.style.top = `${r.top + window.scrollY}px`;
      // if inside table, convert to .table coordinates
      if (this.table && this.table.contains(this.beaker)) {
        // current left/top are page coords; convert to table coords
        const tableRect = this.table.getBoundingClientRect();
        this.beaker.style.left = `${r.left - tableRect.left}px`;
        this.beaker.style.top = `${r.top - tableRect.top}px`;
      }
    }
    try { this.beaker.setPointerCapture && this.beaker.setPointerCapture(ev.pointerId); } catch(e){}
  }

  _onPointerMove(ev) {
    if (!this.isDragging) return;
    // move beaker by pointer location
    const x = ev.clientX - this.dragOffset.x;
    const y = ev.clientY - this.dragOffset.y;
    // If beaker is within .table container (position: absolute inside table), adjust coords
    if (this.table && this.table.contains(this.beaker)) {
      const tableRect = this.table.getBoundingClientRect();
      this.beaker.style.left = `${x - tableRect.left}px`;
      this.beaker.style.top = `${y - tableRect.top}px`;
    } else {
      this.beaker.style.left = `${x + window.scrollX}px`;
      this.beaker.style.top = `${y + window.scrollY}px`;
    }
  }

  _stopPointerDrag(ev) {
    if (!this.isDragging) return;
    this.isDragging = false;
    try { this.beaker.releasePointerCapture && this.beaker.releasePointerCapture(ev.pointerId); } catch(e){}
    // On drop: check overlap with equipments and handle accordingly
    this._evaluateBeakerDrop();
  }

  _evaluateBeakerDrop() {
    if (!this.beaker) return;
    const br = this.beaker.getBoundingClientRect();

    const tryPlace = (el, requiredStep, handler) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (!(r.left > br.right || r.right < br.left || r.top > br.bottom || r.bottom < br.top)) {
        // overlapped
        if (this.currentStep < requiredStep) {
          this._showFeedback('Complete previous steps first.');
          return true;
        } else {
          handler && handler();
          return true;
        }
      }
      return false;
    };

    // Buchner requires step 5
    if (tryPlace(this.buchnerFunnel, 5, () => this._onPlaceOnBuchner())) return;
    // WaterBath requires step 6
    if (tryPlace(this.waterBath, 6, () => this._onPlaceOnWaterBath())) return;
    // IceTub requires step 7
    if (tryPlace(this.iceTub, 7, () => this._onPlaceOnIceTub())) return;

    // If dropped back onto table: accept
    if (this.table) {
      const tr = this.table.getBoundingClientRect();
      if (!(tr.left > br.right || tr.right < br.left || tr.top > br.bottom || tr.bottom < br.top)) {
        this._showFeedback('Beaker returned to table', 'success');
        return;
      }
    }

    // otherwise just leave beaker where dropped
    this._showFeedback('Beaker placed', 'info');
  }

  // -------------------------
  // Place beaker at center of element (called for legacy drop)
  // -------------------------
  _placeBeakerOnElement(el) {
    if (!this.beaker || !el) return;
    const rect = el.getBoundingClientRect();
    if (this.table && this.table.contains(this.beaker)) {
      const tableRect = this.table.getBoundingClientRect();
      const left = rect.left - tableRect.left + rect.width/2 - this.beaker.offsetWidth/2;
      const top = rect.top - tableRect.top + rect.height/2 - this.beaker.offsetHeight/2;
      this.beaker.style.left = `${left}px`;
      this.beaker.style.top = `${top}px`;
    } else {
      // fallback: absolute page coords
      this.beaker.style.left = `${rect.left + rect.width/2 - this.beaker.offsetWidth/2}px`;
      this.beaker.style.top = `${rect.top + rect.height/2 - this.beaker.offsetHeight/2}px`;
    }
  }

  // -------------------------
  // Equipment Handlers (after placing beaker)
  // -------------------------
  _onPlaceOnBuchner() {
    this._showFeedback('Beaker placed on Buchner funnel — filtering started', 'success');
    this._speakShort('Filtering started');
    playSound(this.sounds.filter);

    this._startParticlesAround(this.buchnerFunnel, 'filter', 2600, () => {
      // after done -> next step
      this.currentStep = 6; // next: water bath
      this._updateInstructionsUI();
      this._showFeedback('Filtration complete. Return beaker to table and then place on water bath.', 'success');
    });
  }

  _onPlaceOnWaterBath() {
    this._showFeedback('Beaker placed on water bath — heating', 'success');
    this._speakShort('Heating in water bath started');
   playSound(this.sounds.heat);

    this._startParticlesAround(this.beaker, 'heat', 2800, () => {
      this.currentStep = 7; // next: ice tub
      this._updateInstructionsUI();
      this._showFeedback('Heating finished. Return beaker to table then place in ice bath.', 'success');
    });
  }

  _onPlaceOnIceTub() {
    this._showFeedback('Beaker placed in ice bath — crystallization', 'success');
    this._speakShort('Crystallization started');
    playSound(this.sounds.crystal);

    this._startParticlesAround(this.iceTub, 'crystal', 3200, () => {
      this.currentStep = 8;
      this._updateInstructionsUI();
      this._showFeedback('Crystallization complete — aspirin (simulated) formed!', 'success');
      this._speakShort('Crystallization complete. Aspirin crystals observed.');
      // optionally: show overlay image of crystals — left to you
    });
  }

  // -------------------------
  // Particles: spawn around element
  // -------------------------
  _startParticlesAround(targetEl, type='heat', duration=2000, onComplete=null) {
    if (!targetEl) {
      if (onComplete) setTimeout(onComplete, duration);
      return;
    }
    const rect = targetEl.getBoundingClientRect();
    const spawnArea = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    const spawnParticle = () => {
      const p = {
        x: spawnArea.left + Math.random() * spawnArea.width,
        y: (type === 'filter') ? spawnArea.top + 4 : spawnArea.top + spawnArea.height - 6,
        vx: (Math.random() - 0.5) * 1.8,
        vy: (type === 'filter') ? Math.random() * 2 + 0.4 : -(Math.random() * 1.6 + 0.4),
        r: Math.random() * 3 + 1,
        life: 40 + Math.random() * 60,
        type
      };
      this.particles.push(p);
    };

    const iv = setInterval(() => {
      for (let i=0;i<4;i++) spawnParticle();
    }, 120);

    setTimeout(() => {
      clearInterval(iv);
      // let particles decay, then call onComplete
      setTimeout(() => { if (onComplete) onComplete(); }, 900);
    }, duration);
  }

  // draw overlay particles & persistent beaker fill
  _drawParticlesOnOverlay() {
    // draw particles only (stream drawing function may call this)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      let color = 'rgba(255,200,0,0.9)';
      if (p.type === 'filter') color = 'rgba(200,200,200,0.95)';
      if (p.type === 'crystal') color = 'rgba(140,255,255,0.95)';
      if (p.type === 'pour') color = 'rgba(0,140,255,0.95)';
      this.ctx.beginPath();
      this.ctx.fillStyle = color;
      this.ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      this.ctx.fill();

      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0 || p.y < -40 || p.y > window.innerHeight + 40) {
        this.particles.splice(i,1);
      }
    }
  }

  // called by global render loop: draws persistent fill and particles
  _drawPersistentOverlays() {
    // persistent beaker fill
    if (this.beaker && this.beakerFill && this.beakerFill.pixels > 0) {
      const br = this.beaker.getBoundingClientRect();
      // if the beaker is inside table, convert to viewport coords via getBoundingClientRect (done)
      const fillLeft = br.left + 4;
      const fillWidth = Math.max(4, br.width - 8);
      const fillTop = br.bottom - this.beakerFill.pixels;
      this.ctx.fillStyle = 'rgba(0,140,255,0.28)';
      this.ctx.fillRect(fillLeft, fillTop, fillWidth, this.beakerFill.pixels);
    }
    // particles
    this._drawParticlesOnOverlay();
  }

  // -------------------------
  // Render loop (clears canvas then draws overlays)
  // -------------------------
  _startRenderLoop() {
    if (this._animHandle) return;
    const loop = () => {
      // clear entire canvas
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      // draw persistent overlays (fill & particles)
      this._drawPersistentOverlays();
      this._animHandle = requestAnimationFrame(loop);
    };
    this._animHandle = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._animHandle) cancelAnimationFrame(this._animHandle);
    this._animHandle = null;
  }

  // -------------------------
  // Helpers: feedback, speak, resize canvas
  // -------------------------
  _showFeedback(msg, type='info') {
    // create floating feedback like your CSS .feedback-message
    const fb = document.createElement('div');
    fb.className = 'feedback-message';
    fb.innerText = msg;
    if (type === 'success') fb.style.backgroundColor = '#28a745';
    document.body.appendChild(fb);
    setTimeout(()=> fb.classList.add('fade-out'), 1800);
    setTimeout(()=> fb.remove(), 2400);
  }

  // _speakShort(text) {
  //   if (!('speechSynthesis' in window)) return;
  //   try {
  //     if (this.synth.speaking) this.synth.cancel();
  //     const u = new SpeechSynthesisUtterance(text);
  //     this.synth.speak(u);
  //   } catch(e) {}
  // }

  _resizeCanvas() {
    const w = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const h = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    this.canvas.width = w;
    this.canvas.height = h;
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.aspirinSim = new AspirinSynthesisSim();
  } catch (err) {
    console.error('AspirinSim init error:', err);
  }
});
const soundBtn = document.getElementById('soundToggle');
soundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;

  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  soundBtn.classList.toggle('muted', !soundEnabled);

  // 🔇 stop ongoing speech immediately
  if (!soundEnabled && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
});

// soundBtn.addEventListener('click', () => {
//   soundEnabled = !soundEnabled;

//   soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
//   soundBtn.classList.toggle('muted', !soundEnabled);
// });
