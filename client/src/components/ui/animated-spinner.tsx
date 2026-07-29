import React from "react";

interface AnimatedSpinnerProps {
  size?: string;
  className?: string;
}

export function AnimatedSpinner({
  size = "5rem",
  className = "",
}: AnimatedSpinnerProps) {
  return (
    <>
      <style>{`
        @property --deg {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: true;
        }

        @property --p {
          syntax: "<percentage>";
          initial-value: 0%;
          inherits: true;
        }

        @property --line-width {
          syntax: "<length>";
          initial-value: 0.6rem;
          inherits: true;
        }

        .animated-spinner {
          --color: #ff6600;
          --color-2: #3b82f6;
          --color-3: #00f0ff;
          width: var(--size, ${size});
          background: conic-gradient(
            from var(--deg),
            var(--color),
            var(--color-2),
            var(--color-3),
            transparent var(--p)
          );
          mask: radial-gradient(
            circle,
            transparent calc(var(--size, ${size}) / 2 - var(--line-width, calc(var(--size, ${size}) * 0.15))),
            black calc(var(--size, ${size}) / 2 - var(--line-width, calc(var(--size, ${size}) * 0.15)))
          );
          -webkit-mask: radial-gradient(
            circle,
            transparent calc(var(--size, ${size}) / 2 - var(--line-width, calc(var(--size, ${size}) * 0.15))),
            black calc(var(--size, ${size}) / 2 - var(--line-width, calc(var(--size, ${size}) * 0.15)))
          );
          filter: drop-shadow(0 0 1rem rgba(26, 115, 232, 0.4));
          border-radius: 50%;
          aspect-ratio: 1;
          animation: rotate 1.1s ease infinite, line-width 3.3s ease infinite;
        }

        @keyframes rotate {
          from {
            --p: 20%;
          }
          50% {
            --p: 50%;
          }
          70% {
            --p: 30%;
          }
          90% {
            --p: 10%;
          }
          to {
            --p: 20%;
            --deg: -360deg;
          }
        }

        @keyframes line-width {
          from, 20%, 70%, to {
            --line-width: calc(var(--size, ${size}) * 0.15);
          }
          
          50% {
            --line-width: calc(var(--size, ${size}) * 0.04);
          }
        }
      `}</style>
      <div
        className={`animated-spinner ${className}`}
        style={{ "--size": size } as React.CSSProperties}
      />
    </>
  );
}
