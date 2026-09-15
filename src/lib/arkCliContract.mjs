const ANSI_COLOR_RE = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, 'g');
const CONTROL_CHARACTER_RE = /\p{Cc}/gu;
const AUTHENTICATION_REQUIRED_RE =
  /(?:not\s+(?:logged|signed)\s+in|unauthenticated|authentication\s+required|no\s+(?:active\s+)?profile|login\s+required|未登录|尚未登录|请先登录|需要登录|未认证)/iu;

export function buildArkCliVersionArgs() {
  return ['--version'];
}

/** Use the official read-only login probe without accepting page-supplied arguments. */
export function buildArkCliAuthStatusArgs() {
  return ['auth', 'status', '--format', 'json'];
}

export function arkCliSafeMessage(value, fallback = 'Ark CLI 检测失败。') {
  const message = String(value || '')
    .replace(ANSI_COLOR_RE, '')
    .replace(CONTROL_CHARACTER_RE, '')
    .replace(/\b(?:AKLT|AK)[A-Za-z0-9]{12,}\b/g, '[REDACTED_ACCESS_KEY]')
    .replace(
      /((?:api[_ -]?key|secret(?:[_ -]?access)?[_ -]?key|access[_ -]?token|session[_ -]?token|bearer)\s*["'=:\s]+)[^\s,"'}]+/giu,
      '$1[REDACTED]',
    )
    .trim()
    .slice(0, 1200);
  return message || fallback;
}

export function inspectArkCliAuthStatus(result) {
  const code = Number(result?.code ?? 1);
  const stdout = String(result?.stdout || '').replace(ANSI_COLOR_RE, '').trim();
  const output = arkCliSafeMessage(
    [result?.stdout, result?.stderr].filter(Boolean).join('\n'),
    '',
  );
  let loggedIn;
  try {
    const status = JSON.parse(stdout);
    if (status && typeof status === 'object' && typeof status.logged_in === 'boolean') {
      loggedIn = status.logged_in;
    }
  } catch {
    // A malformed or non-JSON success response must fail closed below.
  }
  const authenticationRequired = loggedIn === false || AUTHENTICATION_REQUIRED_RE.test(output);
  return {
    authenticated: code === 0 && loggedIn === true,
    authenticationRequired,
    message: output,
  };
}
