export function collectCliChatInput(messages) {
  const imageUrls = [];
  const promptParts = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message?.role || 'user');
    const content = message?.content;
    if (typeof content === 'string') {
      if (content.trim()) promptParts.push(`${role}: ${content}`);
      continue;
    }
    if (!Array.isArray(content)) continue;

    const text = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .filter(Boolean)
      .join('\n');
    if (text.trim()) promptParts.push(`${role}: ${text}`);

    for (const part of content) {
      const url =
        part?.type === 'image_url' && typeof part.image_url?.url === 'string'
          ? part.image_url.url.trim()
          : '';
      if (url && !imageUrls.includes(url)) imageUrls.push(url);
    }
  }

  return { prompt: promptParts.join('\n\n'), imageUrls: imageUrls.slice(0, 5) };
}

function extractTextValue(value) {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.text?.value === 'string') return part.text.value;
      if (typeof part.output_text === 'string') return part.output_text;
      return extractTextValue(part.content);
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Normalize text from common Chat Completions and Responses-compatible payloads. */
export function extractRemoteChatText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const candidates = [
    choice?.message?.content,
    choice?.text,
    payload.output_text,
    payload.output?.text,
    payload.output?.content,
    payload.output,
    payload.content,
  ];
  for (const candidate of candidates) {
    const text = extractTextValue(candidate);
    if (text) return text;
  }
  return '';
}

/** Explain empty successful responses without exposing private reasoning text. */
export function describeEmptyRemoteChatResponse(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const finishReason = String(choice?.finish_reason || payload?.status || '')
    .trim()
    .toLowerCase();
  if (finishReason === 'length' || finishReason === 'incomplete') {
    return '上游模型已达到输出长度限制，未返回最终答案。请缩小本次生成范围或改用支持更长输出的模型。';
  }
  const reasoning =
    extractTextValue(choice?.message?.reasoning_content) ||
    extractTextValue(choice?.message?.reasoning) ||
    extractTextValue(payload?.reasoning);
  if (reasoning) {
    return '上游模型只返回了推理过程，没有返回最终答案。请重试或改用非推理模型。';
  }
  const refusal = extractTextValue(choice?.message?.refusal) || extractTextValue(payload?.refusal);
  if (refusal) return '上游模型拒绝生成本次内容，请调整输入后重试。';
  return '上游未返回对话内容。';
}

const REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);

/** Build conservative Chat Completions fields without leaking canvas-only parameters upstream. */
export function buildRemoteChatPayload({
  protocol,
  model,
  messages,
  temperature,
  maxLength,
  reasoningEffort,
}) {
  const normalizedProtocol = String(protocol || '').trim();
  const normalizedModel = String(model || '').trim();
  const reasoningModel =
    normalizedProtocol === 'openai' &&
    /^(?:gpt-5(?:[.-]|$)|o[134](?:[.-]|$))/i.test(normalizedModel);
  const payload = {
    model: normalizedModel,
    messages: Array.isArray(messages) ? messages : [],
    stream: false,
  };
  const numericTemperature = Number(temperature);
  if (!reasoningModel && Number.isFinite(numericTemperature)) {
    payload.temperature = Math.max(0, Math.min(2, numericTemperature));
  }
  const numericLimit = Number(maxLength);
  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    const limit = Math.max(1, Math.min(32768, Math.round(numericLimit)));
    if (reasoningModel || normalizedProtocol === 'xai') payload.max_completion_tokens = limit;
    else payload.max_tokens = limit;
  }
  const effort = String(reasoningEffort || '')
    .trim()
    .toLowerCase();
  if (reasoningModel && REASONING_EFFORTS.has(effort)) payload.reasoning_effort = effort;
  return payload;
}
