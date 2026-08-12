import React from "react";

/**
 * Global Meshwork Studio logo — Pythagorean Right Triangle Design
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
          x1="15"
          y1="15"
          x2="85"
          y2="85"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF5733" />
          <stop offset="0.5" stopColor="#E8391A" />
          <stop offset="1" stopColor="#FF1E00" />
        </linearGradient>
        <linearGradient
          id="pythagorasStroke"
          x1="15"
          y1="15"
          x2="85"
          y2="85"
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

      {/* Outer Glowing Frame */}
      <polygon
        points="18,18 18,82 82,82"
        fill="url(#pythagorasGrad)"
        fillOpacity="0.15"
        stroke="url(#pythagorasStroke)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Main Right Triangle (Pythagoras 3:4:5 shape) */}
      <polygon
        points="22,22 22,78 78,78"
        fill="url(#pythagorasGrad)"
        fillOpacity="0.9"
        stroke="#FFFFFF"
        strokeOpacity="0.3"
        strokeWidth="2"
        strokeLinejoin="round"
        filter="url(#pythagorasGlow)"
      />

      {/* Right-Angle Corner Square Marker */}
      <path
        d="M 22 66 L 34 66 L 34 78"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />

      {/* Hypotenuse Accent Line */}
      <line
        x1="22"
        y1="22"
        x2="78"
        y2="78"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />

      {/* Vertex Geometric Dots */}
      <circle cx="22" cy="22" r="3.5" fill="#FFFFFF" />
      <circle cx="22" cy="78" r="3.5" fill="#FFFFFF" />
      <circle cx="78" cy="78" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}
