export function coinflip(_node, {
    delay = 0,
    duration = 1500
}) {
    return {
        delay,
        duration,
        css: (_t, u) => `
            transform: rotateY(${1 - u * 180}deg);
            opacity: ${1 - u};
        `
    };
}