import React from "react";

/**
 * Meshwork Studio — Logomark
 *
 * Triangle geometry (right-angle, FLAT horizontal base aligned to bottom):
 *   A = (4, 92)   bottom-left  ← pointy apex
 *   B = (96, 92)  bottom-right ← right-angle corner (flat base AB at y=92)
 *   C = (96, 8)   top-right    ← top of short vertical side
 *
 *   AB = flat horizontal base  (long side, at the bottom baseline)
 *   BC = vertical right side   (short side, on the right)
 *   CA = hypotenuse            (diagonal, top-right to bottom-left)
 *
 * Colors match app design tokens: #FF7A33 -> #E8391A -> #B8240C brand orange gradient
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
      aria-label="Meshwork Studio Logo"
    >
      <defs>
        {/* Brand Orange System Gradient (Coral Orange -> Deep Red-Orange -> Dark Crimson) */}
        <linearGradient id="mw-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF7A33" />
          <stop offset="45%" stopColor="#E8391A" />
          <stop offset="100%" stopColor="#B8240C" />
        </linearGradient>

        {/* Hypotenuse Specular Highlight */}
        <linearGradient id="mw-stroke-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFA07A" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
        </linearGradient>

        {/* Soft Ambient Brand Glow Filter */}
        <filter id="mw-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#E8391A" floodOpacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow halo layer */}
      <polygon
        points="4,92 96,92 96,8"
        fill="none"
        stroke="#E8391A"
        strokeWidth="6"
        strokeLinejoin="miter"
        filter="url(#mw-glow)"
        opacity="0.5"
      />

      {/* Main solid triangle */}
      <polygon
        points="4,92 96,92 96,8"
        fill="url(#mw-fill)"
        strokeLinejoin="miter"
      />

      {/* Hypotenuse accent line (top diagonal edge) */}
      <line
        x1="4"
        y1="92"
        x2="96"
        y2="8"
        stroke="url(#mw-stroke-grad)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Thin crisp border around shape */}
      <polygon
        points="4,92 96,92 96,8"
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
        strokeLinejoin="miter"
      />

      {/* Right-angle square marker at B (96, 92), inset into the triangle */}
      <path
        d="M 96 78 L 82 78 L 82 92"
        fill="none"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />

      {/* Apex dot at the sharp left point (4, 92) */}
      <circle cx="4" cy="92" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}
