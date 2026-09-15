export function imageProviderRoute(protocol) {
  if (protocol === 'jimeng') return 'jimeng-cli';
  if (protocol === 'codex') return 'codex-cli';
  if (protocol === 'codebuddy') return 'codebuddy-cli';
  if (protocol === 'bailian') return 'bailian-cli';
  if (protocol === 'lightx2v') return 'lightx2v-cli';
  return 'openai-compatible';
}

/** Map a persisted provider identity to the exact remote image API contract. */
export function imageApiAdapter(providerId, protocol) {
  if (providerId === 'img-recraft') return 'recraft';
  if (providerId === 'img-ideogram') return 'ideogram-v4';
  if (providerId === 'img-flux') return 'bfl';
  if (providerId === 'img-imagen') return 'imagen';
  if (providerId === 'img-minimax') return 'minimax';
  if (providerId === 'img-doubao' || protocol === 'volcengine') return 'volcengine';
  if (providerId === 'img-grok' || protocol === 'xai') return 'xai';
  if (providerId === 'img-kling') return 'unsupported-kling';
  if (protocol === 'modelscope') return 'unsupported-modelscope';
  return 'openai-gpt-image';
}
