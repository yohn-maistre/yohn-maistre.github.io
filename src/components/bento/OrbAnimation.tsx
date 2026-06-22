import { useEffect, useRef } from 'react';
// @ts-ignore - animejs v4 types might not be available yet
import { animate, createTimeline, createTimer, stagger, utils } from 'animejs';

interface OrbAnimationProps {
  state:
    | 'listening'
    | 'thinking'
    | 'speaking'
    | 'disconnected'
    | 'connecting'
    | 'initializing'
    | 'sleeping';
  audioTrack?: MediaStreamTrack;
  onConnect?: () => void;
}

/**
 * State palette — each particle blends between `tip` (darkest, dead-centre)
 * and `edge` (lightest, grid corners) by its radial distance from centre.
 * That's where the depth comes from: not a uniform color, but a per-particle
 * lerp across the 13×13 grid.
 */
interface Palette {
  /** Centermost particle. Dark, low chroma. */
  tip: [number, number, number];
  /** Corner particles. Lighter, more chroma. */
  edge: [number, number, number];
  /** Outer glow color. Brighter than `edge`. */
  glow: string;
}

const PALETTES: Record<string, Palette> = {
  idle: {
    tip: [14, 37, 69], // #0e2545 very dark navy
    edge: [89, 132, 178], // #5984b2 medium blue
    glow: 'rgba(120, 180, 230, 0.95)'
  },
  connecting: {
    tip: [38, 24, 18], // #261812 dark brown
    edge: [200, 168, 144], // #c8a890 light tan
    glow: 'rgba(220, 190, 170, 0.95)'
  },
  active: {
    // listening / thinking / speaking
    tip: [22, 64, 58], // #16403a dark teal
    edge: [126, 215, 192], // #7ed7c0 bright mint
    glow: 'rgba(140, 220, 190, 0.95)'
  },
  sleeping: {
    tip: [20, 51, 58], // #14333a very dark teal
    edge: [80, 130, 145], // #508291 medium cool
    glow: 'rgba(100, 160, 170, 0.45)'
  }
};

function paletteFor(state: OrbAnimationProps['state']): Palette {
  if (state === 'connecting' || state === 'initializing') return PALETTES.connecting;
  if (state === 'sleeping') return PALETTES.sleeping;
  if (state === 'listening' || state === 'thinking' || state === 'speaking') return PALETTES.active;
  return PALETTES.idle;
}

function rgbStr(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

export default function OrbAnimation({ state, audioTrack, onConnect }: OrbAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const creatureRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  const mainLoopRef = useRef<any>(null);
  const autoMoveRef = useRef<any>(null);
  const manualTimeoutRef = useRef<any>(null);

  // No internal isConnecting flag anymore — the "connecting" visual is driven
  // by the `state` prop directly. This means the parent can remove `key={state}`
  // and we don't lose the click handler.
  const handleClick = () => {
    if (onConnect) onConnect();
  };

  // Mirror prop into ref so the animation loop reads the latest without
  // restarting (the loop has [] dep on purpose).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Audio analyser. Same as before — fftSize 32 is fine for our needs.
  useEffect(() => {
    if (!audioTrack) return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    source.connect(analyser);
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    return () => {
      audioContext.close();
    };
  }, [audioTrack]);

  // Animation setup — runs once, reads state from refs each frame.
  useEffect(() => {
    if (!containerRef.current || !creatureRef.current) return;

    const creatureEl = creatureRef.current;
    const container = containerRef.current;
    const rows = 13;
    const grid = [rows, rows];
    const from = 'center';
    const center = (rows - 1) / 2;
    const maxDist = Math.hypot(center, center);

    // Mutable viewport — kept in sync via ResizeObserver below so the
    // auto-move timeline tracks real container bounds when the user resizes
    // the window or toggles devtools.
    const initialRect = container.getBoundingClientRect();
    const viewport = { w: initialRect.width * 0.5, h: initialRect.height * 0.5 };
    const cursor = cursorRef.current;

    // Per-particle radial distance from grid centre (0..1). Drives both
    // color depth and opacity in the depth shading.
    const distFor = (i: number) => {
      const row = Math.floor(i / rows);
      const col = i % rows;
      return Math.hypot(row - center, col - center) / maxDist;
    };

    const scaleStagger = stagger([2, 5], { ease: 'inQuad', grid, from });
    const opacityStagger = stagger([1, 0.18], { grid, from });

    creatureEl.innerHTML = '';
    for (let i = 0; i < rows * rows; i++) {
      const div = document.createElement('div');
      Object.assign(div.style, {
        transformStyle: 'preserve-3d',
        position: 'relative',
        width: '4em',
        height: '4em',
        margin: '3em',
        borderRadius: '2em',
        willChange: 'transform',
        background: rgbStr(PALETTES.idle.tip),
        boxShadow: `0 0 18px ${PALETTES.idle.glow}`
      });
      div.className = 'orb-particle';
      creatureEl.appendChild(div);
    }
    const particuleEls = creatureEl.querySelectorAll('div');

    utils.set(creatureEl, {
      width: rows * 10 + 'em',
      height: rows * 10 + 'em'
    });
    utils.set(particuleEls, {
      x: 0,
      y: 0,
      scale: scaleStagger,
      opacity: opacityStagger
    });

    // Pulse animation (normal or fast for loading)
    const pulse = (fast = false) => {
      animate(particuleEls, {
        keyframes: [
          {
            scale: 5,
            opacity: 1,
            delay: stagger(fast ? 40 : 90, { start: fast ? 0 : 1650, grid, from }),
            duration: fast ? 100 : 150
          },
          {
            scale: scaleStagger,
            opacity: opacityStagger,
            ease: 'inOutQuad',
            duration: fast ? 300 : 600
          }
        ]
      });
    };

    /**
     * Apply per-particle radial color depth: centre uses palette.tip
     * (darkest), corners use palette.edge (lightest). The glow brightens
     * toward the corners too so the orb has a halo feel without a flat
     * uniform color.
     */
    const applyPalette = (palette: Palette) => {
      particuleEls.forEach((el, i) => {
        const dist = distFor(i);
        const color = rgbStr(lerpColor(palette.tip, palette.edge, dist));
        const el2 = el as HTMLElement;
        el2.style.background = color;
        // Larger glow on outer particles for the halo look.
        const glowSize = 12 + dist * 14;
        el2.style.boxShadow = `0 0 ${glowSize}px ${palette.glow}`;
      });
    };

    // Initial paint.
    applyPalette(PALETTES.idle);

    let loadingPulseInterval: any = null;

    const startLoadingPulse = () => {
      if (loadingPulseInterval) return;
      pulse(true);
      loadingPulseInterval = setInterval(() => pulse(true), 500);
    };
    const stopLoadingPulse = () => {
      if (loadingPulseInterval) {
        clearInterval(loadingPulseInterval);
        loadingPulseInterval = null;
      }
    };

    // Main loop — reads state, drives color/scale/position.
    const mainLoop = createTimer({
      frameRate: 15,
      onUpdate: () => {
        const currentState = stateRef.current;
        const isConnecting = currentState === 'connecting' || currentState === 'initializing';
        const isActive =
          currentState === 'listening' ||
          currentState === 'thinking' ||
          currentState === 'speaking';

        // Update colors based on state (smoothly via per-particle palette).
        applyPalette(paletteFor(currentState));

        // Voice reactivity for speaking state.
        let audioModifier = 1;
        if (analyserRef.current && dataArrayRef.current && currentState === 'speaking') {
          analyserRef.current.getByteFrequencyData(
            dataArrayRef.current as unknown as Uint8Array<ArrayBuffer>
          );
          const avg =
            dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
          audioModifier = 1 + avg / 128;

          animate(particuleEls, {
            scale: (_el: any, i: any) => (scaleStagger as any)(_el, i) * audioModifier,
            duration: 100,
            ease: 'linear',
            composition: 'blend'
          });
        }

        // Connecting → start the fast-pulse loop. Anything else → stop it.
        if (isConnecting) startLoadingPulse();
        else stopLoadingPulse();

        // Position handling. Active + connecting + sleeping pause the
        // auto-move and smoothly decay the cursor toward (0, 0) so the orb
        // re-centres no matter where the user clicked. Idle resumes the
        // organic auto-move + cursor-follow.
        if (isConnecting || isActive || currentState === 'sleeping') {
          if (!autoMove.paused) autoMove.pause();
          // 0.86 per 15-FPS tick → ~80% decayed in 1s, fully centred in ~2.5s.
          cursor.x *= 0.86;
          cursor.y *= 0.86;
        } else {
          if (autoMove.paused) autoMove.play();
        }

        // Always animate to the (possibly-decaying) cursor — gives us a
        // smooth interpolation in both directions without the "snap to grid"
        // glitch that used to happen on click.
        animate(particuleEls, {
          x: cursor.x,
          y: cursor.y,
          delay: stagger(40, { grid, from }),
          duration: stagger(120, { start: 750, ease: 'inQuad', grid, from }),
          ease: 'inOut',
          composition: 'blend'
        });
      }
    });
    mainLoopRef.current = mainLoop;

    const normalPulse = () => pulse(false);

    // Auto-move timeline — drives the cursor when idle.
    const autoMove = createTimeline()
      .add(
        cursor,
        {
          x: [-viewport.w * 0.45, viewport.w * 0.45],
          modifier: (x: number) => x + Math.sin(mainLoop.currentTime * 0.0007) * viewport.w * 0.5,
          duration: 3000,
          ease: 'inOutExpo',
          alternate: true,
          loop: true,
          onBegin: normalPulse,
          onLoop: normalPulse
        },
        0
      )
      .add(
        cursor,
        {
          y: [-viewport.h * 0.45, viewport.h * 0.45],
          modifier: (y: number) =>
            y + Math.cos(mainLoop.currentTime * 0.00012) * viewport.h * 0.5,
          duration: 1000,
          ease: 'inOutQuad',
          alternate: true,
          loop: true
        },
        0
      );
    autoMoveRef.current = autoMove;

    // Manual movement timeout — when the visitor moves the pointer, we
    // pause auto-move briefly, then resume.
    const manualMovementTimeout = createTimer({
      duration: 1500,
      onComplete: () => {
        // Only resume auto-move if we're back in idle.
        const s = stateRef.current;
        const stillIdle =
          s !== 'connecting' &&
          s !== 'initializing' &&
          s !== 'listening' &&
          s !== 'thinking' &&
          s !== 'speaking' &&
          s !== 'sleeping';
        if (stillIdle) autoMove.play();
      }
    });
    manualTimeoutRef.current = manualMovementTimeout;

    const followPointer = (e: MouseEvent | TouchEvent) => {
      const s = stateRef.current;
      // Pointer interaction is only meaningful in idle. During active states
      // we want the orb staying centred.
      if (
        s === 'connecting' ||
        s === 'initializing' ||
        s === 'listening' ||
        s === 'thinking' ||
        s === 'speaking' ||
        s === 'sleeping'
      ) {
        return;
      }
      const event = e.type === 'touchmove' ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      const rect = container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      cursor.x = event.clientX - rect.left - centerX;
      cursor.y = event.clientY - rect.top - centerY;
      autoMove.pause();
      manualMovementTimeout.restart();
    };

    container.addEventListener('mousemove', followPointer as any);
    container.addEventListener('touchmove', followPointer as any);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      viewport.w = width * 0.5;
      viewport.h = height * 0.5;
    });
    resizeObserver.observe(container);

    return () => {
      mainLoop.pause();
      autoMove.pause();
      manualMovementTimeout.pause();
      stopLoadingPulse();
      resizeObserver.disconnect();
      container.removeEventListener('mousemove', followPointer as any);
      container.removeEventListener('touchmove', followPointer as any);
    };
    // Empty dependency array is intentional: the animation must NOT tear down
    // and rebuild every time the agent state or audio track changes (that
    // would re-create 169 DOM nodes and reset the timeline 60+ times per
    // session). Instead, prop changes are funneled through stateRef so the
    // animation loop reads the latest values without restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSleeping = state === 'sleeping';

  return (
    <div
      ref={containerRef}
      className='absolute inset-0 flex items-center justify-center overflow-hidden cursor-pointer'
      style={{
        background: isSleeping
          ? 'linear-gradient(135deg, #243845 0%, #2c4a52 50%, #243845 100%)'
          : 'linear-gradient(135deg, #f0e6d2 0%, #a8c9c0 25%, #e8dcc4 50%, #c4d9d4 75%, #f0e6d2 100%)',
        backgroundSize: '300% 300%',
        animation: isSleeping
          ? 'aksaraBreath 4s ease-in-out infinite'
          : 'gradientShift 8s ease-in-out infinite',
        transition: 'background 600ms ease-in-out'
      }}
      onClick={handleClick}
    >
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes aksaraBreath {
          0%, 100% { background-position: 0% 50%; filter: brightness(0.85); }
          50% { background-position: 100% 50%; filter: brightness(1); }
        }
      `}</style>

      {/* Grainy overlay */}
      <div
        className='absolute inset-0 opacity-20 pointer-events-none'
        style={{ filter: 'url(#noise)' }}
      ></div>
      {/*
        SVG filter source. Must NOT use `display: none` — Firefox (and some
        WebKit builds) skip rendering filter primitives inside hidden SVGs,
        which would break the grainy overlay above. Using zero-size +
        absolute positioning keeps it out of layout while still letting the
        filter resolve.
      */}
      <svg
        aria-hidden='true'
        focusable='false'
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      >
        <filter id='noise'>
          <feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch' />
        </filter>
      </svg>

      <div
        ref={creatureRef}
        className='flex flex-wrap justify-center items-center'
        style={{
          fontSize: 'clamp(0.04em, 0.08vh, 0.12em)',
          width: '150em',
          height: '150em'
        }}
      />
    </div>
  );
}
