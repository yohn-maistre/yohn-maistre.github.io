import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - animejs v4 types might not be available yet
import { animate, createTimeline, createTimer, stagger, utils } from 'animejs';

interface OrbAnimationProps {
  state: 'listening' | 'thinking' | 'speaking' | 'disconnected' | 'connecting' | 'initializing';
  audioTrack?: MediaStreamTrack;
  onConnect?: () => void;
}

export default function OrbAnimation({ state, audioTrack, onConnect }: OrbAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const creatureRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const cursorRef = useRef({ x: 0, y: 0 });
  const mainLoopRef = useRef<any>(null);
  const autoMoveRef = useRef<any>(null);
  const manualTimeoutRef = useRef<any>(null);

  const handleClick = () => {
    if (onConnect && !isConnecting) {
      setIsConnecting(true);
      onConnect();
    }
  };

  // Use refs to track state changes without triggering effect rerun
  const stateRef = useRef(state);
  const isConnectingRef = useRef(isConnecting);

  // Update refs when props change (doesn't trigger animation recreation)
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    isConnectingRef.current = isConnecting;
  }, [isConnecting]);

  // Audio Analysis Setup
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

  // Animation Setup - Port of Codepen logic
  useEffect(() => {
    if (!containerRef.current || !creatureRef.current) return;

    const creatureEl = creatureRef.current;
    const container = containerRef.current;
    const rows = 13;
    const grid = [rows, rows];
    const from = 'center';
    
    // Get viewport size relative to container
    const rect = container.getBoundingClientRect();
    const viewport = { w: rect.width * 0.5, h: rect.height * 0.5 };
    const cursor = cursorRef.current;
    
    const scaleStagger = stagger([2, 5], { ease: 'inQuad', grid, from });
    const opacityStagger = stagger([1, 0.1], { grid, from });
    
    creatureEl.innerHTML = '';
    
    for (let i = 0; i < (rows * rows); i++) {
      const div = document.createElement('div');
      Object.assign(div.style, {
        transformStyle: 'preserve-3d',
        position: 'relative',
        width: '4em',
        height: '4em',
        margin: '3em',
        borderRadius: '2em',
        willChange: 'transform',
        // Idle state: deep blue (reversed from before)
        background: '#1e3a5f',
        boxShadow: '0 0 15px rgba(70, 120, 180, 0.9)',  // Brighter glow
      });
      div.className = 'orb-particle';
      creatureEl.appendChild(div);
    }

    const particuleEls = creatureEl.querySelectorAll('div');

    // Set creature size
    utils.set(creatureEl, {
      width: rows * 10 + 'em',
      height: rows * 10 + 'em'
    });

    // Set initial particle state
    utils.set(particuleEls, {
      x: 0,
      y: 0,
      scale: scaleStagger,
      opacity: opacityStagger,
    });

    // Pulse animation (normal or fast for loading)
    const pulse = (fast = false) => {
      animate(particuleEls, {
        keyframes: [
          {
            scale: 5,
            opacity: 1,
            delay: stagger(fast ? 40 : 90, { start: fast ? 0 : 1650, grid, from }),
            duration: fast ? 100 : 150,
          }, {
            scale: scaleStagger,
            opacity: opacityStagger,
            ease: 'inOutQuad',
            duration: fast ? 300 : 600
          }
        ],
      });
    };

    // Update orb colors based on state
    const updateOrbColors = (color: string, shadowColor: string) => {
      particuleEls.forEach((el) => {
        (el as HTMLElement).style.background = color;
        (el as HTMLElement).style.boxShadow = `0 0 15px ${shadowColor}`;  // Increased glow
      });
    };

    // Main loop - particles follow cursor
    const mainLoop = createTimer({
      frameRate: 15,
      onUpdate: () => {
        const currentState = stateRef.current;
        const connecting = isConnectingRef.current;

        // Update colors based on state (REVERSED)
        if (connecting) {
          // Loading state: dark brown for visual feedback
          updateOrbColors('#533c32ff', 'rgba(200, 180, 170, 0.9)');
        } else if (currentState === 'listening' || currentState === 'thinking' || currentState === 'speaking') {
          // Connected state: teal/green (REVERSED - was blue before)
          updateOrbColors('#4a9d8e', 'rgba(140, 200, 180, 0.9)');
        } else {
          // Idle/disconnected: deep blue (REVERSED - was brown before)
          updateOrbColors('#1e3a5f', 'rgba(70, 120, 180, 0.9)');
        }

        // Voice reactivity for speaking state
        let audioModifier = 1;
        if (analyserRef.current && dataArrayRef.current && currentState === 'speaking') {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
          audioModifier = 1 + (avg / 128);
          
          // Apply scale based on audio
          animate(particuleEls, {
            scale: (el: any, i: any) => scaleStagger(el, i) * audioModifier,
            duration: 100,
            ease: 'linear',
            composition: 'blend'
          });
        }

        // Seamless pause/resume logic
        if (connecting || currentState === 'listening' || currentState === 'thinking' || currentState === 'speaking') {
          // Paused states: stop auto-move, freeze at current position
          autoMove.pause();
          // Don't animate x/y - orbs stay where they are
        } else {
          // Idle state: resume organic movement
          if (autoMove.paused) autoMove.play();
          
          // Normal cursor following
          animate(particuleEls, {
            x: cursor.x,
            y: cursor.y,
            delay: stagger(40, { grid, from }),
            duration: stagger(120, { start: 750, ease: 'inQuad', grid, from }),
            ease: 'inOut',
            composition: 'blend',
          });
        }
      }
    });

    mainLoopRef.current = mainLoop;

    // Loading pulse loop
    let loadingPulseInterval: any = null;
    if (isConnecting) {
      pulse(true);  // Immediate fast pulse
      loadingPulseInterval = setInterval(() => pulse(true), 500);
    }

    // Wrapper function for pulse callbacks (fixes timing)
    const normalPulse = () => pulse(false);

    // Auto-move timeline - animates cursor position
    const autoMove = createTimeline()
      .add(cursor, {
        x: [-viewport.w * 0.45, viewport.w * 0.45],
        modifier: (x: number) => x + Math.sin(mainLoop.currentTime * 0.0007) * viewport.w * 0.5,
        duration: 3000,
        ease: 'inOutExpo',
        alternate: true,
        loop: true,
        onBegin: normalPulse,  // Fixed: use wrapper
        onLoop: normalPulse,   // Fixed: use wrapper
      }, 0)
      .add(cursor, {
        y: [-viewport.h * 0.45, viewport.h * 0.45],
        modifier: (y: number) => y + Math.cos(mainLoop.currentTime * 0.00012) * viewport.h * 0.5,
        duration: 1000,
        ease: 'inOutQuad',
        alternate: true,
        loop: true,
      }, 0);

    autoMoveRef.current = autoMove;

    // Manual movement timeout
    const manualMovementTimeout = createTimer({
      duration: 1500,
      onComplete: () => autoMove.play(),
    });

    manualTimeoutRef.current = manualMovementTimeout;

    // Follow pointer
    const followPointer = (e: MouseEvent | TouchEvent) => {
      const event = e.type === 'touchmove' ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      const rect = container.getBoundingClientRect();
      // Center the cursor position relative to the middle of the container
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      cursor.x = (event.clientX - rect.left) - centerX;
      cursor.y = (event.clientY - rect.top) - centerY;
      autoMove.pause();
      manualMovementTimeout.restart();
    };

    // Add mouse tracking to container
    container.addEventListener('mousemove', followPointer as any);
    container.addEventListener('touchmove', followPointer as any);

    return () => {
      mainLoop.pause();
      autoMove.pause();
      manualMovementTimeout.pause();
      if (loadingPulseInterval) clearInterval(loadingPulseInterval);
      container.removeEventListener('mousemove', followPointer as any);
      container.removeEventListener('touchmove', followPointer as any);
    };
    // Empty dependencies - effect only runs once on mount
    // State changes handled via refs in the animation loop
  }, []);  // ← Critical: empty deps prevent recreation on state change

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 flex items-center justify-center overflow-hidden cursor-pointer"
      style={{ 
        // Old static background: background: 'radial-gradient(circle at center, #2a2a2a 0%, #000000 100%)',
        // Pastel gradient with distinct color stops for better separation
        background: 'linear-gradient(135deg, #f0e6d2 0%, #a8c9c0 25%, #e8dcc4 50%, #c4d9d4 75%, #f0e6d2 100%)',
        backgroundSize: '300% 300%',
        animation: 'gradientShift 8s ease-in-out infinite',  // Faster animation (8s instead of 20s)
      }}
      onClick={handleClick}
    >
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      
      {/* Grainy overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: 'url(#noise)' }}></div>
      <svg className="hidden">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        </filter>
      </svg>
      
      <div 
        ref={creatureRef} 
        className="flex flex-wrap justify-center items-center"
        style={{
          // fontSize: '0.2vh',  // Original zoom level
          // fontSize: '0.12vh',  // First zoom out
          fontSize: '0.08vh',  // Zoomed out further for more flight space
          width: '150em',
          height: '150em'
        }}
      />
    </div>
  );
}
