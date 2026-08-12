import React from "react";

/**
 * Global Meshwork Studio logo — Pythagorean Right Triangle
 * Orientation: apex/point on left, long horizontal base at bottom,
 * short vertical side on right, right-angle at bottom-right.
 */
export function MeshworkLogo({
  className = "w-full h-full",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient
          id="pythagorasGrad"
          x1="10"
          y1="50"
          x2="90"
          y2="80"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF5733" />
          <stop offset="0.5" stopColor="#E8391A" />
          <stop offset="1" stopColor="#FF1E00" />
        </linearGradient>
        <linearGradient
          id="pythagorasStroke"
          x1="10"
          y1="50"
          x2="90"
          y2="80"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFA07A" />
          <stop offset="1" stopColor="#FF4500" />
        </linearGradient>
        <filter
          id="pythagorasGlow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer glowing frame */}
      <polygon
        points="8,50 92,83 92,17"
        fill="url(#pythagorasGrad)"
        fillOpacity="0.15"
        stroke="url(#pythagorasStroke)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Main right triangle:
            - Left point (apex): (14, 50)
            - Bottom-right (right-angle): (86, 80)
            - Top-right: (86, 20)
            Long horizontal base: bottom from left tip to bottom-right
            Short vertical side: right side from top-right down to bottom-right
            Hypotenuse: from top-right diagonally to left apex
      */}
      <polygon
        points="14,50 86,80 86,20"
        fill="url(#pythagorasGrad)"
        fillOpacity="0.9"
        stroke="#FFFFFF"
        strokeOpacity="0.3"
        strokeWidth="2"
        strokeLinejoin="round"
        filter="url(#pythagorasGlow)"
      />

      {/* Right-angle marker at bottom-right corner (86, 80) */}
      <path
        d="M 86 68 L 74 68 L 74 80"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />

      {/* Vertex dots */}
      <circle cx="14" cy="50" r="3.5" fill="#FFFFFF" />
      <circle cx="86" cy="80" r="3.5" fill="#FFFFFF" />
      <circle cx="86" cy="20" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}
