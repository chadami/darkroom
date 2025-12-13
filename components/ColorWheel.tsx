import React, { useRef, useState, useEffect } from 'react';

interface ColorWheelProps {
  size: number;
  onChange: (angle: number, distance: number) => void;
  isProcessing?: boolean;
}

const ColorWheel: React.FC<ColorWheelProps> = ({ size, onChange, isProcessing }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const radius = size / 2;

  const handleInteraction = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;

    let dx = clientX - centerX;
    let dy = clientY - centerY;

    // Calculate distance and angle
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);

    // Constrain to circle
    const maxDist = radius - 10; // Padding
    if (dist > maxDist) {
      dx = Math.cos(angle) * maxDist;
      dy = Math.sin(angle) * maxDist;
    }

    setPosition({ x: dx, y: dy });

    // Normalize distance 0-1
    const normDist = Math.min(dist / maxDist, 1);
    onChange(angle, normDist);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isDragging) handleInteraction(e.clientX, e.clientY);
    };
    const handleUp = () => setIsDragging(false);
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging) {
        e.preventDefault(); 
        handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging]);

  const reset = () => {
    setPosition({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div className="relative flex flex-col items-center gap-6 mt-4 mb-4">
      {/* 
        Labels positioned according to Math Angles:
        0 deg (Right) -> Red -> C+
        120 deg (Bottom-Left) -> Green -> M+
        240 deg (Top-Left) -> Blue -> Y+
      */}
      
      {/* C Axis (Red - Cyan) */}
      <div className="absolute right-[-24px] top-1/2 -translate-y-1/2 text-red-500 font-bold font-mono text-sm">C+</div>
      <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 text-cyan-500 font-bold font-mono text-sm">C-</div>

      {/* Y Axis (Blue - Yellow) - TopLeft/BottomRight */}
      <div className="absolute left-[15%] top-[-10px] text-blue-500 font-bold font-mono text-sm">Y+</div>
      <div className="absolute right-[15%] bottom-[-10px] text-yellow-500 font-bold font-mono text-sm">Y-</div>

      {/* M Axis (Green - Magenta) - BottomLeft/TopRight */}
      <div className="absolute left-[15%] bottom-[-10px] text-green-500 font-bold font-mono text-sm">M+</div>
      <div className="absolute right-[15%] top-[-10px] text-fuchsia-500 font-bold font-mono text-sm">M-</div>

      <div
        ref={containerRef}
        className={`relative rounded-full shadow-2xl cursor-pointer touch-none select-none transition-transform duration-100 ${isDragging ? 'scale-105' : ''}`}
        style={{
          width: size,
          height: size,
          // Conic Gradient rotated 90deg so Red is at 0 Math Angle (Right)
          background: `conic-gradient(
            from 90deg, 
            #ff0000 0deg, 
            #ffff00 60deg, 
            #00ff00 120deg, 
            #00ffff 180deg, 
            #0000ff 240deg, 
            #ff00ff 300deg, 
            #ff0000 360deg
          )`
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Saturation Overlay */}
        <div 
          className="absolute inset-0 rounded-full" 
          style={{
            background: 'radial-gradient(circle, rgba(64,64,64,1) 0%, rgba(64,64,64,0) 60%)'
          }}
        />

        {/* Axis Lines for easier orientation */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          {/* C Axis (Horizontal) */}
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white"></div>
          {/* M Axis (120 deg) */}
          <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white origin-left rotate-[120deg]"></div>
          <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white origin-left rotate-[300deg]"></div>
          {/* Y Axis (240 deg) */}
          <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white origin-left rotate-[240deg]"></div>
          <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white origin-left rotate-[60deg]"></div>
        </div>

        {/* The Puck */}
        <div
          className="absolute w-6 h-6 bg-transparent border-2 border-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
          style={{
            left: radius + position.x,
            top: radius + position.y,
            boxShadow: 'inset 0 0 4px rgba(0,0,0,0.8)'
          }}
        >
          <div className="w-1 h-1 bg-white rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
        </div>
      </div>

      <button 
        onClick={reset}
        disabled={isProcessing}
        className="text-xs text-neutral-500 hover:text-white transition-colors"
      >
        Reset to Neutral
      </button>
    </div>
  );
};

export default ColorWheel;