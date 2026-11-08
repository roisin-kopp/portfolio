export function createRoomBackground(canvas, pointerTarget) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create room background canvas');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const particles = [];
  let width = 0;
  let height = 0;
  let previousPointer = null;

  function resize() {
    const oldWidth = width;
    const oldHeight = height;
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (oldWidth && oldHeight) {
      for (const particle of particles) {
        particle.x *= width / oldWidth;
        particle.y *= height / oldHeight;
      }
    }

    const count = Math.round(Math.min(450, Math.max(120, width * height / 3200)) * 0.7);
    while (particles.length < count) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 8;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.8 + Math.random() * 2,
        opacity: (0.35 + Math.random() * 0.4) * 0.7,
        color: Math.random() < 0.35 ? '130, 165, 255' : '245, 140, 230',
        driftX: Math.cos(angle) * speed,
        driftY: Math.sin(angle) * speed,
        vx: 0,
        vy: 0
      });
    }
    particles.length = count;
  }

  pointerTarget.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || event.pointerType === 'touch') return;
    const current = { x: event.clientX, y: event.clientY };
    if (previousPointer) {
      const dx = current.x - previousPointer.x;
      const dy = current.y - previousPointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const steps = Math.min(25, Math.ceil(distance / 24));
        for (let i = 1; i <= steps; i++) {
          const x = previousPointer.x + dx * i / steps;
          const y = previousPointer.y + dy * i / steps;
          for (const particle of particles) {
            const px = particle.x - x;
            const py = particle.y - y;
            const separation = Math.hypot(px, py);
            if (separation >= 120 || separation < 0.01) continue;
            const force = (1 - separation / 120) * Math.min(distance, 80) * 0.45;
            particle.vx += (px / separation + dx / distance) * force;
            particle.vy += (py / separation + dy / distance) * force;
          }
        }
      }
    }
    previousPointer = current;
  });
  pointerTarget.addEventListener('pointerleave', () => { previousPointer = null; });

  function update(delta) {
    const dt = Math.min(delta, 0.05);
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      if (!reducedMotion.matches) {
        particle.x = ((particle.x + (particle.driftX + particle.vx) * dt) % width + width) % width;
        particle.y = ((particle.y + (particle.driftY + particle.vy) * dt) % height + height) % height;
        const damping = Math.exp(-1.3 * dt);
        particle.vx *= damping;
        particle.vy *= damping;
      }
      context.fillStyle = `rgba(${particle.color}, ${particle.opacity})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  resize();
  return { resize, update };
}
