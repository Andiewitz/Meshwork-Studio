// Stops PostCSS config lookup from reaching the parent repo's Tailwind v3
// config. The landing uses Tailwind v4 via @tailwindcss/vite only.
module.exports = { plugins: {} };
