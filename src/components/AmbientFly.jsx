import React, { useState, useEffect, useRef } from 'react';

function AmbientFly() {
  const flyRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const spawnRef = useRef(null); // exposed so double-click can trigger

  useEffect(() => {
    // Desktop only: skip if viewport < 1024px
    if (window.innerWidth < 1024) return;

    let raf, timeout;
    const FLY_SIZE = 32;
    const SPEED = 85; // constant pixels per second
    const SAMPLES = 2000; // arc-length table resolution

    // Path = linear drift (entry→exit) + 2 gentle low-frequency sine waves.
    // Only 2 waves with low frequencies = big lazy swooping loops, no tight turns.
    // The max oscillation speed is capped below 40% of drift speed so the fly
    // never reverses or doubles back - just gentle sweeping curves.
    function generateFlight() {
      const w = window.innerWidth, h = window.innerHeight;
      const centerW = Math.min(1152, w * 0.9);
      const marginSize = Math.max((w - centerW) / 2, 60);
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const marginCenter = side === 'left' ? marginSize * 0.5 : w - marginSize * 0.5;

      // Entry and exit - always off-screen, biased to opposite vertical edges
      // so the fly traverses a long path through the margin
      const entryTop = Math.random() < 0.5;
      const entry = {
        x: marginCenter + (Math.random() - 0.5) * marginSize * 0.4,
        y: entryTop ? -50 : h + 50,
      };
      const exit = {
        x: marginCenter + (Math.random() - 0.5) * marginSize * 0.4,
        y: entryTop ? h + 50 : -50, // exit opposite side for long traversal
      };

      // Drift length determines safe oscillation amplitude
      const driftLen = Math.sqrt((exit.x - entry.x) ** 2 + (exit.y - entry.y) ** 2);

      // 2 low-frequency waves per axis - gentle and loopy
      // Frequencies: 1-2.5 full cycles over the path (low = wide loops)
      // Amplitudes: capped so oscillation velocity stays well below drift velocity
      const maxAmp = Math.min(marginSize * 0.4, driftLen * 0.06);
      const xWave = {
        freq: 1.0 + Math.random() * 1.5,   // 1–2.5 cycles
        amp: maxAmp * (0.6 + Math.random() * 0.4),
        phase: Math.random() * Math.PI * 2,
      };
      const yWave = {
        freq: 1.5 + Math.random() * 1.0,   // 1.5–2.5 cycles (slightly different = variety)
        amp: 60 + Math.random() * 60,       // 60–120px lateral swing
        phase: Math.random() * Math.PI * 2,
      };

      return { entry, exit, xWave, yWave };
    }

    // Evaluate position at parametric t in [0, 1]
    function evalAt(f, t) {
      // Linear drift from entry to exit
      let x = f.entry.x + (f.exit.x - f.entry.x) * t;
      let y = f.entry.y + (f.exit.y - f.entry.y) * t;
      // Smooth window: fades oscillations to zero at entry/exit (no jerk at edges)
      const win = Math.sin(t * Math.PI);
      // Gentle oscillations perpendicular to drift
      x += f.xWave.amp * Math.sin(f.xWave.freq * t * Math.PI * 2 + f.xWave.phase) * win;
      y += f.yWave.amp * Math.sin(f.yWave.freq * t * Math.PI * 2 + f.yWave.phase) * win;
      return { x, y };
    }

    // Build arc-length lookup table: sample the path finely, accumulate distance
    function buildArcTable(flight) {
      const table = new Float64Array(SAMPLES + 1);
      table[0] = 0;
      let prev = evalAt(flight, 0);
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const pt = evalAt(flight, t);
        const dx = pt.x - prev.x, dy = pt.y - prev.y;
        table[i] = table[i - 1] + Math.sqrt(dx * dx + dy * dy);
        prev = pt;
      }
      return table;
    }

    // Given distance traveled, return parametric t via binary search on arc table
    function distToT(arcTable, dist) {
      const totalLen = arcTable[SAMPLES];
      if (dist <= 0) return 0;
      if (dist >= totalLen) return 1;
      let lo = 0, hi = SAMPLES;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (arcTable[mid] < dist) lo = mid; else hi = mid;
      }
      const frac = (dist - arcTable[lo]) / (arcTable[hi] - arcTable[lo] || 1);
      return (lo + frac) / SAMPLES;
    }

    function startFlight() {
      const flight = generateFlight();
      const arcTable = buildArcTable(flight);
      const totalLen = arcTable[SAMPLES];
      let dist = 0;
      let lastTime = null;
      setVisible(true);

      function tick(now) {
        if (!lastTime) { lastTime = now; raf = requestAnimationFrame(tick); return; }
        const dtSec = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        dist += SPEED * dtSec;

        if (dist >= totalLen) {
          setVisible(false);
          timeout = setTimeout(startFlight, 60000 + Math.random() * 84000); // 1–2.4 min
          return;
        }

        const t = distToT(arcTable, dist);
        const pos = evalAt(flight, t);
        // Heading from analytical derivative approximation (finite diff on smooth curve)
        const eps = 0.0005;
        const next = evalAt(flight, Math.min(t + eps, 1));
        const ang = Math.atan2(next.y - pos.y, next.x - pos.x) * (180 / Math.PI) + 90;

        if (flyRef.current) {
          flyRef.current.style.transform = `translate(${pos.x - FLY_SIZE/2}px, ${pos.y - FLY_SIZE/2}px) rotate(${ang}deg)`;
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }

    // Expose spawn for double-click on the date
    window.__spawnFly = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      startFlight();
    };

    // First appearance after 1–2.4 min
    timeout = setTimeout(startFlight, 60000 + Math.random() * 84000);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      delete window.__spawnFly;
    };
  }, []);

  // Don't render on mobile at all
  if (typeof window !== 'undefined' && window.innerWidth < 1024) return null;

  return (
    <React.Fragment>
      <style>{`
        @keyframes afwing { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.15); } }
      `}</style>
      <div ref={flyRef} style={{
        position: 'fixed', top: 0, left: 0, zIndex: 5,
        pointerEvents: 'none', willChange: 'transform',
        opacity: visible ? 0.55 : 0, transition: 'opacity 0.6s',
      }}>
        <svg width="32" height="32" viewBox="0 0 44 44" fill="none">
          <ellipse cx="12" cy="22" rx="10" ry="4.5" fill="#c4b5fd" opacity="0.4" transform="rotate(-15 18 20)"
            style={{ transformOrigin: '22px 20px', animation: 'afwing 60ms linear infinite' }} />
          <ellipse cx="32" cy="22" rx="10" ry="4.5" fill="#c4b5fd" opacity="0.4" transform="rotate(15 26 20)"
            style={{ transformOrigin: '22px 20px', animation: 'afwing 60ms linear infinite' }} />
          <ellipse cx="22" cy="28" rx="5" ry="8" fill="#7c3aed" opacity="0.85"/>
          <ellipse cx="22" cy="20" rx="4.5" ry="4.5" fill="#8b5cf6"/>
          <circle cx="22" cy="13" r="3.5" fill="#a78bfa"/>
          <circle cx="20" cy="12" r="1.6" fill="#ef4444"/>
          <circle cx="24" cy="12" r="1.6" fill="#ef4444"/>
          <circle cx="19.5" cy="11.5" r="0.5" fill="#fca5a5" opacity="0.7"/>
          <circle cx="23.5" cy="11.5" r="0.5" fill="#fca5a5" opacity="0.7"/>
          <path d="M20.5 10.5 Q18 6 16 5" stroke="#a78bfa" strokeWidth="0.6" fill="none" opacity="0.6"/>
          <path d="M23.5 10.5 Q26 6 28 5" stroke="#a78bfa" strokeWidth="0.6" fill="none" opacity="0.6"/>
          <path d="M18.5 19 Q15 22 12 24" stroke="#7c3aed" strokeWidth="0.7" fill="none" opacity="0.5"/>
          <path d="M25.5 19 Q29 22 32 24" stroke="#7c3aed" strokeWidth="0.7" fill="none" opacity="0.5"/>
          <path d="M18 22 Q14 25 11 28" stroke="#7c3aed" strokeWidth="0.7" fill="none" opacity="0.5"/>
          <path d="M26 22 Q30 25 33 28" stroke="#7c3aed" strokeWidth="0.7" fill="none" opacity="0.5"/>
          <path d="M19 25 Q15 29 13 32" stroke="#7c3aed" strokeWidth="0.7" fill="none" opacity="0.5"/>
          <path d="M25 25 Q29 29 31 32" stroke="#7c3aed" strokeWidth="0.7" fill="none" opacity="0.5"/>
          <ellipse cx="22" cy="26" rx="4.2" ry="0.6" fill="#6d28d9" opacity="0.3"/>
          <ellipse cx="22" cy="29" rx="3.5" ry="0.5" fill="#6d28d9" opacity="0.3"/>
          <ellipse cx="22" cy="32" rx="2.5" ry="0.4" fill="#6d28d9" opacity="0.3"/>
        </svg>
      </div>
    </React.Fragment>
  );
}

export default AmbientFly;
