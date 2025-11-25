import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  isUserSpeaking: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, isUserSpeaking }) => {
  const bars = 5;

  return (
    <div className="flex items-center justify-center gap-1.5 h-12 w-24">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`
            w-2 rounded-full transition-all duration-150 ease-in-out
            ${isActive ? 'bg-primary-400' : 'bg-slate-300'}
            ${isActive && isUserSpeaking ? 'animate-pulse' : ''}
          `}
          style={{
            height: isActive 
              ? `${Math.max(20, Math.random() * 100)}%` 
              : '20%',
            animationDelay: `${i * 0.1}s`
          }}
        />
      ))}
    </div>
  );
};

export default AudioVisualizer;
