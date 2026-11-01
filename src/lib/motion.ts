// The reader's motion preference, in one place: animations and glides skip
// (or take no time) when they've asked the system for reduced motion.

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// An animation's duration, or 0 under reduced motion.
export const ms = (duration: number) => (reducedMotion() ? 0 : duration)
