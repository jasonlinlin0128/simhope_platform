'use client';

import { useEffect, useRef } from 'react';

// Match original landing-page blob sizes, colors, float config and mouse strength
const BLOBS = [
  { color: '#a78bfa', size: 600, top: '-200px', left: '-150px',  floatX: 30,  floatY: -40, floatDur: 12, scale: 1.05, strength: 0.70 },
  { color: '#60a5fa', size: 500, top: '20%',    right: '-100px', floatX: -20, floatY: 30,  floatDur: 10, scale: 1.08, strength: 0.90 },
  { color: '#ffd166', size: 400, bottom: '10%', left: '30%',     floatX: 10,  floatY: -20, floatDur: 14, scale: 0.95, strength: 0.50 },
  { color: '#34d399', size: 350, bottom: '-100px', right: '10%', floatX: -25, floatY: 35,  floatDur: 9,  scale: 1.05, strength: 0.80 },
  { color: '#ff6b6b', size: 450, top: '55%',    left: '-5%',     floatX: 20,  floatY: -30, floatDur: 11, scale: 1.06, strength: 0.75 },
  { color: '#f472b6', size: 380, top: '72%',    right: '15%',    floatX: -15, floatY: 25,  floatDur: 13, scale: 1.04, strength: 0.85 },
  { color: '#fb923c', size: 500, top: '90%',    left: '40%',     floatX: 30,  floatY: -15, floatDur: 15, scale: 1.07, strength: 0.60 },
];

export default function BlobBackground() {
  const blobRefs = useRef([]);

  useEffect(() => {
    let gsapInstance;
    let ctx;
    let tickFn;
    let observer;
    let removeMouseMove;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    // Float state stored in plain JS objects (not DOM) — same pattern as original HTML
    const floatState = BLOBS.map(() => ({ x: 0, y: 0, scale: 1 }));

    async function init() {
      try {
        const gsapModule = await import('gsap');
        gsapInstance = gsapModule.gsap || gsapModule.default;

        // Animate float state on JS objects inside a context
        ctx = gsapInstance.context(() => {
          BLOBS.forEach((blob, i) => {
            gsapInstance.to(floatState[i], {
              keyframes: [
                { x: blob.floatX, y: blob.floatY, scale: blob.scale, duration: blob.floatDur / 2 },
                { x: 0, y: 0, scale: 1, duration: blob.floatDur / 2 },
              ],
              repeat: -1,
              ease: 'sine.inOut',
              delay: i * 0.7,
            });
          });
        });

        // Mouse tracking — store target, lerp in ticker
        const handleMouseMove = (e) => {
          mouse.tx = e.clientX - window.innerWidth / 2;
          mouse.ty = e.clientY - window.innerHeight / 2;
        };
        window.addEventListener('mousemove', handleMouseMove);
        removeMouseMove = () => window.removeEventListener('mousemove', handleMouseMove);

        // Dark mode opacity observer
        let lastDarkMode = null;
        observer = new MutationObserver(() => {
          const isDark = document.documentElement.classList.contains('dark');
          if (isDark === lastDarkMode) return;
          lastDarkMode = isDark;
          blobRefs.current.forEach(el => {
            if (!el) return;
            gsapInstance.to(el, { opacity: isDark ? 0.12 : 0.3, duration: 0.5 });
          });
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // GSAP ticker: lerp mouse each frame + combine with float → gsap.set on DOM
        tickFn = () => {
          mouse.x += (mouse.tx - mouse.x) * 0.05;
          mouse.y += (mouse.ty - mouse.y) * 0.05;
          blobRefs.current.forEach((el, i) => {
            if (!el) return;
            const blob = BLOBS[i];
            const dir = i % 2 === 0 ? 1 : -1;
            gsapInstance.set(el, {
              x: floatState[i].x + mouse.x * blob.strength * dir,
              y: floatState[i].y + mouse.y * blob.strength * dir,
              scale: floatState[i].scale,
            });
          });
        };
        gsapInstance.ticker.add(tickFn);
      } catch (err) {
        console.error('BlobBackground: failed to initialize GSAP', err);
      }
    }

    init();

    return () => {
      removeMouseMove?.();
      if (gsapInstance && tickFn) gsapInstance.ticker.remove(tickFn);
      ctx?.revert();
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {BLOBS.map((blob, i) => {
        const style = {
          position: 'absolute',
          width: blob.size,
          height: blob.size,
          borderRadius: '50%',
          background: blob.color,
          filter: 'blur(80px)',
          opacity: 0.3,
          willChange: 'transform',
          ...(blob.top    !== undefined && { top:    blob.top    }),
          ...(blob.bottom !== undefined && { bottom: blob.bottom }),
          ...(blob.left   !== undefined && { left:   blob.left   }),
          ...(blob.right  !== undefined && { right:  blob.right  }),
        };
        return <div key={i} ref={el => blobRefs.current[i] = el} style={style} />;
      })}
    </div>
  );
}
