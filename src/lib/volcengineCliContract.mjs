const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REGION_RE = /^[a-z]{2}-[a-z0-9-]{2,48}$/;
const ANSI_COLOR_RE = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, 'g');
const CONTROL_CHARACTER_RE = /\p{Cc}/gu;

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function parseJsonObject(value) {
  if (record(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

function cleanText(value, maximum = 2400) {
  return String(value || '')
    .replace(ANSI_COLOR_RE, '')
    .replace(CONTROL_CHARACTER_RE, '')
    .replace(/\b(?:AKLT|AK)[A-Za-z0-9]{12,}\b/g, '[REDACTED_ACCESS_KEY]')
    .replace(
      /((?:secret(?:[_ -]?access)?[_ -]?key|session[_ -]?token)\s*["'=:\s]+)[^\s,"'}]+/gi,
      '$1[REDACTED]',
    )
    .trim()
    .slice(0, maximum);
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

export const VOLCENGINE_DEFAULT_REGION = 'cn-beijing';

export function buildVolcengineVersionArgs() {
  return ['version'];
}

/** Build the documented STS identity probe without accepting arbitrary CLI arguments. */
export function buildVolcengineIdentityArgs(options = {}) {
  const profile = String(options?.profile || '').trim();
  const region = String(options?.region || VOLCENGINE_DEFAULT_REGION).trim();
  if (profile && !PROFILE_RE.test(profile)) throw new Error('火山引擎 CLI 配置名称格式无效。');
  if (!REGION_RE.test(region)) throw new Error('火山引擎 CLI 地域格式无效。');
  return [
    'sts',
    'GetCallerIdentity',
    ...(profile ? ['--profile', profile] : []),
    '--region',
    region,
  ];
}

/** Read the JSON shape returned by `ve sts GetCallerIdentity`. */
export function parseVolcengineIdentity(value) {
  const payload = parseJsonObject(value);
  if (!payload) {
    return { valid: false, accountId: '', userId: '', identity: '', requestId: '' };
  }
  const responseMetadata = record(payload.ResponseMetadata) || record(payload.responseMetadata);
  const error = record(responseMetadata?.Error) || record(payload.Error) || record(payload.error);
  const result = record(payload.Result) || record(payload.result) || payload;
  const accountId = firstText(
    result.AccountId,
    result.AccountID,
    result.accountId,
    result.account_id,
  );
  const userId = firstText(result.UserId, result.UserID, result.userId, result.user_id);
  const identity = firstText(
    result.Trn,
    result.TRN,
    result.Arn,
    result.ARN,
    result.Identity,
    result.identity,
  );
  const requestId = firstText(
    responseMetadata?.RequestId,
    responseMetadata?.RequestID,
    payload.RequestId,
    payload.RequestID,
  );
  return {
    valid: !error && Boolean(accountId || userId || identity || requestId),
    accountId,
    userId,
    identity,
    requestId,
  };
}

export function volcengineCliErrorMessage(value, fallback = '火山引擎 CLI 调用失败。') {
  const payload = parseJsonObject(value);
  if (!payload) return cleanText(value) || fallback;
  const responseMetadata = record(payload.ResponseMetadata) || record(payload.responseMetadata);
  const responseError = record(responseMetadata?.Error) || record(responseMetadata?.error);
  const error = record(payload.Error) || record(payload.error);
  return (
    firstText(
      responseError?.Message,
      responseError?.message,
      error?.Message,
      error?.message,
      payload.Message,
      payload.message,
    ) || fallback
  );
}

export function isVolcengineAuthenticationError(value) {
  const payload = parseJsonObject(value);
  const responseMetadata = record(payload?.ResponseMetadata) || record(payload?.responseMetadata);
  const error =
    record(responseMetadata?.Error) ||
    record(responseMetadata?.error) ||
    record(payload?.Error) ||
    record(payload?.error);
  const codeAndMessage = firstText(
    error?.Code,
    error?.code,
    error?.Message,
    error?.message,
    payload?.Message,
    payload?.message,
    typeof value === 'string' ? value : '',
  ).toLowerCase();
  return /(?:credential|access.?key|secret.?key|signature|token|unauthori[sz]ed|authentication|not.?logged|login|未登录|凭证|密钥|签名)/i.test(
    codeAndMessage,
  );
}
