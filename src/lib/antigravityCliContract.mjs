const AUTH_FAILURE_RE =
  /(?:please\s+(?:sign|log)\s*in|not\s+logged\s+in(?:to)?|unauth(?:enticated|orized)|login\s+required|auth\s+method\s+is\s+unspecified)/i;

/** Antigravity is authenticated only when `agy models` returns a real catalog. */
export function inspectAntigravityModelProbe(result) {
  const output = String(result?.output || '').trim();
  const authenticationRequired = AUTH_FAILURE_RE.test(output);
  const catalogLines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^(?:error|warning|info|fetching available models)/i.test(line) &&
        !AUTH_FAILURE_RE.test(line),
    );
  const authenticated = result?.code === 0 && !authenticationRequired && catalogLines.length > 0;
  return {
    authenticated,
    authenticationRequired,
    decisiveMessage:
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => AUTH_FAILURE_RE.test(line)) || '',
  };
}
