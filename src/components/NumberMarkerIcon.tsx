import type { LucideProps } from 'lucide-react';
import { forwardRef } from 'react';

export const NumberMarkerIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = 'currentColor', size = 24, strokeWidth = 2, absoluteStrokeWidth, ...props }, ref) => {
    const resolvedStrokeWidth =
      absoluteStrokeWidth && typeof size === 'number' && typeof strokeWidth === 'number'
        ? (strokeWidth * 24) / size
        : strokeWidth;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9.75 9.25 12 7.5v9M9.75 16.5h4.5" />
      </svg>
    );
  },
);

NumberMarkerIcon.displayName = 'NumberMarkerIcon';
