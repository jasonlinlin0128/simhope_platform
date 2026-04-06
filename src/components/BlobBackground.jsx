'use client';

import { useEffect, useRef } from 'react';

const BLOBS = [
  { id: 'b1', color: '#a78bfa', size: 280, top: '-80px', left: '-60px',  blur: 80, opacity: 0.3, duration: 12, strength: 0.04 },
  { id: 'b2', color: '#60a5fa', size: 220, top: '10%',   right: '-40px', blur: 70, opacity: 0.25, duration: 9,  strength: 0.06 },
  { id: 'b3', color: '#ffd166', size: 160, top: '40%',   left: '20%',    blur: 60, opacity: 0.2,  duration: 15, strength: 0.03 },
  { id: 'b4', color: '#f472b6', size: 200, bottom: '5%', left: '-30px',  blur: 65, opacity: 0.25, duration: 11, strength: 0.05 },
  { id: 'b5', color: '#34d399', size: 180, bottom: '10%',right: '10%',   blur: 55, opacity: 0.2,  duration: 13, strength: 0.07 },
  { id: 'b6', color: '#a78bfa', size: 130, top: '60%',   left: '55%',    blur: 50, opacity: 0.18, duration: 10, strength: 0.08 },
  { id: 'b7', color: '#60a5fa', size: 240, top: '25%',   left: '-80px',  blur: 75, opacity: 0.22, duration: 14, strength: 0.02 },
];

export default function BlobBackground() {
  const blobRefs = useRef([]);

  useEffect(() => {
    let gsapInstance;
    let ctx;
    let cleanup;

    async function init() {
      const gsapModule = await import('gsap');
      gsapInstance = gsapModule.gsap || gsapModule.default;
      ctx = gsapInstance.context(() => {});

      // Float animations
      blobRefs.current.forEach((el, i) => {
        if (!el) return;
        const blob = BLOBS[i];
        gsapInstance.to(el, {
          y: -24,
          duration: blob.duration,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.8,
        });
      });

      // Mouse tracking
      const handleMouseMove = (e) => {
        blobRefs.current.forEach((el, i) => {
          if (!el) return;
          const blob = BLOBS[i];
          gsapInstance.to(el, {
            x: (e.clientX - window.innerWidth / 2) * blob.strength,
            y: (e.clientY - window.innerHeight / 2) * blob.strength,
            duration: 1.5,
            ease: 'power1.out',
            overwrite: 'auto',
          });
        });
      };
      window.addEventListener('mousemove', handleMouseMove);

      // Dark mode opacity observer
      const observer = new MutationObserver(() => {
        const isDark = document.documentElement.classList.contains('dark');
        blobRefs.current.forEach((el) => {
          if (!el) return;
          gsapInstance.to(el, { opacity: isDark ? 0.12 : parseFloat(el.dataset.opacity), duration: 0.5 });
        });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      cleanup = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        observer.disconnect();
      };
    }

    init();
    return () => {
      cleanup && cleanup();
      ctx && ctx.revert();
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
          filter: `blur(${blob.blur}px)`,
          opacity: blob.opacity,
          ...(blob.top    !== undefined && { top:    blob.top    }),
          ...(blob.bottom !== undefined && { bottom: blob.bottom }),
          ...(blob.left   !== undefined && { left:   blob.left   }),
          ...(blob.right  !== undefined && { right:  blob.right  }),
        };
        return (
          <div
            key={blob.id}
            ref={el => blobRefs.current[i] = el}
            data-opacity={blob.opacity}
            style={style}
          />
        );
      })}
    </div>
  );
}
