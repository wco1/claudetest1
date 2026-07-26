const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

const COLOURS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET = '\x1b[0m';
const useColour = process.stdout.isTTY;

function emit(level, scope, args) {
  if (LEVELS[level] > threshold) return;
  const stamp = new Date().toISOString().slice(11, 23);
  const tag = `${stamp} ${level.toUpperCase().padEnd(5)} [${scope}]`;
  const head = useColour ? `${COLOURS[level]}${tag}${RESET}` : tag;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(head, ...args);
}

export function createLogger(scope) {
  return {
    error: (...a) => emit('error', scope, a),
    warn: (...a) => emit('warn', scope, a),
    info: (...a) => emit('info', scope, a),
    debug: (...a) => emit('debug', scope, a),
  };
}

export const logger = createLogger('app');
