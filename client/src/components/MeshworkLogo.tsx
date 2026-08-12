import React from "react";

/**
 * Meshwork Studio — Logomark
 *
 * Triangle geometry (right-angle, FLAT horizontal base):
 *   A = (12, 82)  bottom-left  ← pointy apex
 *   B = (88, 82)  bottom-right ← right-angle corner
 *   C = (88, 22)  top-right    ← top of short vertical side
 *
 *   AB = flat horizontal base  (long side, at the bottom)
 *   BC = vertical right side   (short side, on the right)
 *   CA = hypotenuse            (diagonal, top-right to bottom-left)
 *
 * Colors match app design tokens: #E8391A brand orange, dark canvas #0C0C0E
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
      aria-label="Meshwork Studio"
    >
      <defs>
        {/* Brand orange — warm left tip → deep-orange right */}
        <linearGradient
          id="mw-fill"
          x1="12"
          y1="82"
          x2="88"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FF6240" />
          <stop offset="55%" stopColor="#E8391A" />
          <stop offset="100%" stopColor="#C42E12" />
        </linearGradient>

        {/* Highlight overlay for depth */}
        <linearGradient
          id="mw-highlight"
          x1="12"
          y1="22"
          x2="88"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
        </linearGradient>

        {/* Ambient brand-orange glow behind the shape */}
        <filter id="mw-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
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
        points="12,82 88,82 88,22"
        fill="none"
        stroke="#E8391A"
        strokeWidth="8"
        strokeLinejoin="miter"
        filter="url(#mw-glow)"
        opacity="0.55"
      />

      {/* Main solid triangle */}
      <polygon
        points="12,82 88,82 88,22"
        fill="url(#mw-fill)"
        strokeLinejoin="miter"
      />

      {/* Depth highlight layer */}
      <polygon
        points="12,82 88,82 88,22"
        fill="url(#mw-highlight)"
        strokeLinejoin="miter"
      />

      {/* Thin white edge for crispness */}
      <polygon
        points="12,82 88,82 88,22"
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="1"
        strokeLinejoin="miter"
      />

      {/* Right-angle square marker at B (88, 82), inset into the triangle */}
      <path
        d="M 88 70 L 76 70 L 76 82"
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />

      {/* Apex dot at the sharp left point */}
      <circle cx="12" cy="82" r="2.5" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}
