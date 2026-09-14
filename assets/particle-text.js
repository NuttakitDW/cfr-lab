(() => {
  "use strict";

  const target = document.querySelector("[data-particle-text]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!target || !document.createElement("canvas").getContext) return;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!context || !maskContext) return;

  canvas.setAttribute("aria-hidden", "true");
  target.append(canvas);

  const particles = [];
  const pointer = {
    x: 0,
    y: 0,
    processedX: 0,
    processedY: 0,
    known: false,
    active: false,
    moved: false,
    exitAfterFrame: false
  };
  let padding = 36;
  let logicalWidth = 0;
  let logicalHeight = 0;
  let frame = 0;
  let resizeTimer = 0;
  let ready = false;

  const drawText = (ctx, text, x, baseline, style, spacing) => {
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#000";
    let cursor = x;
    [...text].forEach((character, index, characters) => {
      ctx.fillText(character, cursor, baseline);
      cursor += ctx.measureText(character).width;
      if (index < characters.length - 1) cursor += spacing;
    });
  };

  const render = () => {
    context.clearRect(0, 0, logicalWidth, logicalHeight);
    context.fillStyle = "#16408f";
    context.beginPath();
    for (const particle of particles) {
      context.moveTo(particle.x + particle.radius, particle.y);
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    }
    context.fill();
  };

  const segmentDistance = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const amount = lengthSquared
      ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
      : 0;
    const nearestX = x1 + amount * dx;
    const nearestY = y1 + amount * dy;
    return { dx: x - nearestX, dy: y - nearestY };
  };

  const segmentIntersects = (x1, y1, x2, y2, minX, minY, maxX, maxY) => {
    let start = 0;
    let end = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const edges = [
      [-dx, x1 - minX],
      [dx, maxX - x1],
      [-dy, y1 - minY],
      [dy, maxY - y1]
    ];

    for (const [direction, distance] of edges) {
      if (!direction && distance < 0) return false;
      if (!direction) continue;
      const amount = distance / direction;
      if (direction < 0) start = Math.max(start, amount);
      else end = Math.min(end, amount);
      if (start > end) return false;
    }
    return true;
  };

  const animate = () => {
    frame = 0;
    if (document.hidden) return;

    const radius = Math.max(38, Math.min(58, logicalHeight * 0.42));
    let moving = false;
    for (const particle of particles) {
      if (pointer.active && pointer.moved) {
        const offset = segmentDistance(
          particle.x,
          particle.y,
          pointer.processedX,
          pointer.processedY,
          pointer.x,
          pointer.y
        );
        const distance = Math.hypot(offset.dx, offset.dy);
        if (distance < radius) {
          const safeDistance = Math.max(distance, 0.1);
          const force = (1 - safeDistance / radius) * 8;
          particle.vx += (offset.dx / safeDistance) * force;
          particle.vy += (offset.dy / safeDistance) * force;
        }
      }

      particle.vx += (particle.homeX - particle.x) * 0.05;
      particle.vy += (particle.homeY - particle.y) * 0.05;
      particle.vx *= 0.84;
      particle.vy *= 0.84;
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (
        Math.abs(particle.x - particle.homeX) > 0.08 ||
        Math.abs(particle.y - particle.homeY) > 0.08 ||
        Math.abs(particle.vx) > 0.04 ||
        Math.abs(particle.vy) > 0.04
      ) moving = true;
    }

    const pointerMoved = pointer.moved;
    pointer.processedX = pointer.x;
    pointer.processedY = pointer.y;
    pointer.moved = false;
    if (pointer.exitAfterFrame) {
      pointer.active = false;
      pointer.exitAfterFrame = false;
    }
    render();
    if (moving || pointerMoved) frame = requestAnimationFrame(animate);
  };

  const requestFrame = () => {
    if (!reducedMotion.matches && !frame) frame = requestAnimationFrame(animate);
  };

  const rebuild = () => {
    const style = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const nextPadding = Math.abs(parseFloat(getComputedStyle(canvas).top)) || 36;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    padding = nextPadding;
    logicalWidth = Math.ceil(rect.width + padding * 2);
    logicalHeight = Math.ceil(rect.height + padding * 2);
    canvas.width = Math.ceil(logicalWidth * dpr);
    canvas.height = Math.ceil(logicalHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    maskCanvas.width = logicalWidth;
    maskCanvas.height = logicalHeight;
    maskContext.clearRect(0, 0, logicalWidth, logicalHeight);

    const spacing = parseFloat(style.letterSpacing) || 0;
    const probeFont = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    maskContext.font = probeFont;
    const metrics = maskContext.measureText(target.firstChild.nodeValue.trim());
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const baseline = padding + (rect.height - inkHeight) / 2 + metrics.actualBoundingBoxAscent;
    drawText(maskContext, target.firstChild.nodeValue.trim(), padding, baseline, style, spacing);

    const pixels = maskContext.getImageData(0, 0, logicalWidth, logicalHeight).data;
    const sampleGap = rect.height > 90 ? 2 : 1.75;
    particles.length = 0;
    for (let y = 0; y < logicalHeight; y += sampleGap) {
      for (let x = 0; x < logicalWidth; x += sampleGap) {
        const pixelX = Math.floor(x);
        const pixelY = Math.floor(y);
        if (pixels[(pixelY * logicalWidth + pixelX) * 4 + 3] > 72) {
          const homeX = x + (Math.random() - 0.5) * 0.55;
          const homeY = y + (Math.random() - 0.5) * 0.55;
          particles.push({
            x: homeX,
            y: homeY,
            homeX,
            homeY,
            vx: 0,
            vy: 0,
            radius: sampleGap * (0.46 + Math.random() * 0.08)
          });
        }
      }
    }

    render();
    if (!ready) {
      ready = true;
      target.classList.add("is-particle-ready");
    }
  };

  const updatePointer = (event) => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const interactionPadding = 18;
    const maxX = rect.width - interactionPadding;
    const maxY = rect.height - interactionPadding;
    const inside = x >= interactionPadding && x <= maxX && y >= interactionPadding && y <= maxY;
    const crosses = pointer.known && segmentIntersects(
      pointer.x,
      pointer.y,
      x,
      y,
      interactionPadding,
      interactionPadding,
      maxX,
      maxY
    );

    if (inside || crosses || pointer.active) {
      if (!pointer.active) {
        pointer.processedX = pointer.known ? pointer.x : x;
        pointer.processedY = pointer.known ? pointer.y : y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
      pointer.moved = true;
      pointer.exitAfterFrame = !inside;
      requestFrame();
    } else {
      pointer.x = x;
      pointer.y = y;
    }
    pointer.known = true;
  };

  window.addEventListener("pointermove", updatePointer, { passive: true });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) {
      pointer.active = false;
      requestFrame();
    }
  }, { passive: true });
  const releasePointer = () => {
    if (!pointer.active) return;
    pointer.active = false;
    pointer.moved = false;
    requestFrame();
  };
  window.addEventListener("blur", releasePointer);
  window.addEventListener("scroll", releasePointer, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!document.hidden) {
      pointer.active = false;
      pointer.moved = false;
      requestFrame();
    }
  });

  reducedMotion.addEventListener("change", (event) => {
    pointer.active = false;
    pointer.moved = false;
    if (event.matches) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else {
      rebuild();
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    if (reducedMotion.matches) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuild, 100);
  });
  resizeObserver.observe(target);

  const start = () => {
    if (!reducedMotion.matches) rebuild();
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else window.addEventListener("load", start, { once: true });
})();
