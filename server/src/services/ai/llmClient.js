import { config } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

function providerError(code, message, details) {
  return new AppError({ status: 503, code, message, details });
}

function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new AppError({
      status: 502,
      code: 'AI_INVALID_OUTPUT',
      message: 'The AI provider returned an empty response. Please retry.',
    });
  }
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new AppError({
      status: 502,
      code: 'AI_INVALID_OUTPUT',
      message: 'The AI provider did not return valid JSON. Please retry.',
    });
  }
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new AppError({
      status: 502,
      code: 'AI_INVALID_OUTPUT',
      message: 'The AI provider returned malformed JSON. Please retry.',
    });
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetry(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOpenAi({ system, user, temperature, maxTokens }) {
  const base = (config.ai.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const body = {
    model: config.ai.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };

  let response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 400) {
    // Some OpenAI-compatible gateways/models reject response_format. Retry once
    // without it; the prompt still requires JSON and output is validated.
    const errorText = await response.text();
    if (/response_format|json_object/i.test(errorText)) {
      delete body.response_format;
      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } else {
      throw providerError('AI_REQUEST_REJECTED', 'The AI provider rejected the analysis request.', {
        status: 400,
        providerMessage: errorText.slice(0, 300),
      });
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const error = providerError(
      response.status === 401 || response.status === 403
        ? 'AI_AUTH_FAILED'
        : response.status === 429
          ? 'AI_RATE_LIMITED'
          : 'AI_UNAVAILABLE',
      response.status === 401 || response.status === 403
        ? 'The AI provider rejected the configured API key.'
        : response.status === 429
          ? 'The AI provider rate limit was reached. Try again shortly.'
          : 'The AI provider is temporarily unavailable.',
      { status: response.status, providerMessage: errorText.slice(0, 300) },
    );
    error.retryable = shouldRetry(response.status);
    throw error;
  }

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  return { text, usage: payload?.usage || null };
}

async function requestAnthropic({ system, user, temperature, maxTokens }) {
  const base = (config.ai.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const url = base.endsWith('/messages') ? base : `${base}/messages`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.ai.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const error = providerError(
      response.status === 401 || response.status === 403
        ? 'AI_AUTH_FAILED'
        : response.status === 429
          ? 'AI_RATE_LIMITED'
          : 'AI_UNAVAILABLE',
      response.status === 401 || response.status === 403
        ? 'The AI provider rejected the configured API key.'
        : response.status === 429
          ? 'The AI provider rate limit was reached. Try again shortly.'
          : 'The AI provider is temporarily unavailable.',
      { status: response.status, providerMessage: errorText.slice(0, 300) },
    );
    error.retryable = shouldRetry(response.status);
    throw error;
  }

  const payload = await response.json();
  const text = Array.isArray(payload?.content)
    ? payload.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    : '';
  return { text, usage: payload?.usage || null };
}

/**
 * Call the configured LLM and return parsed JSON. Retries are limited and only
 * applied to transient failures. Resume/JD content is never logged.
 */
export async function callAiJson({
  system,
  user,
  temperature = 0.2,
  maxTokens = config.ai.maxOutputTokens,
  purpose = 'analysis',
}) {
  if (config.ai.provider === 'heuristic') {
    throw new Error('callAiJson must not be used with the heuristic provider.');
  }
  const started = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= config.ai.maxRetries; attempt += 1) {
    try {
      const result =
        config.ai.provider === 'anthropic'
          ? await requestAnthropic({ system, user, temperature, maxTokens })
          : await requestOpenAi({ system, user, temperature, maxTokens });
      const parsed = extractJson(result.text);
      if (config.ai.logMetadata) {
        logger.info('AI request completed', {
          purpose,
          provider: config.ai.provider,
          model: config.ai.model,
          attempt: attempt + 1,
          durationMs: Date.now() - started,
          inputChars: user.length,
          usage: result.usage || undefined,
        });
      }
      return parsed;
    } catch (error) {
      lastError = error;
      const isAbort = error?.name === 'AbortError';
      const retryable =
        isAbort || error?.retryable === true || ['AI_UNAVAILABLE', 'AI_RATE_LIMITED'].includes(error?.code);
      if (attempt >= config.ai.maxRetries || !retryable) break;
      const backoff = Math.min(8000, 800 * 2 ** attempt) + Math.floor(Math.random() * 250);
      logger.warn('AI request retrying', {
        purpose,
        provider: config.ai.provider,
        attempt: attempt + 1,
        code: error?.code || (isAbort ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR'),
      });
      await sleep(backoff);
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new AppError({
      status: 504,
      code: 'AI_TIMEOUT',
      message: 'The AI provider did not respond in time. You can retry the analysis.',
    });
  }
  if (lastError instanceof AppError) throw lastError;
  if (lastError?.code === 'AI_INVALID_OUTPUT') throw lastError;
  throw new AppError({
    status: 503,
    code: 'AI_UNAVAILABLE',
    message: 'The AI provider could not be reached. Check the server configuration or try again.',
    cause: lastError,
  });
}
