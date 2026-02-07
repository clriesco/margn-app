import React from "react";

interface RangeSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  step?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Styled range slider with gradient fill and pill-shaped thumb.
 * Requires `.range-slider` global CSS (defined in _app.tsx).
 */
export function RangeSlider({
  min,
  max,
  value,
  onChange,
  step,
  style,
  className,
}: RangeSliderProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const trackBg = `linear-gradient(to right, var(--accent-green) 0%, var(--accent-green) ${percent}%, var(--slider-track, rgba(100,116,139,0.2)) ${percent}%, var(--slider-track, rgba(100,116,139,0.2)) 100%)`;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className={`range-slider ${className || ""}`}
      style={{
        ...style,
        background: trackBg,
      }}
    />
  );
}
