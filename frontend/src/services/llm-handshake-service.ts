export type HandshakeProvider = 'qwen' | 'deepseek' | 'openai' | 'gemini'

export interface ProviderHealthCheckRequest {
  url: string
  method: 'GET'
  timeout: number
  header: Record<string, string>
}

export interface ProviderHealthCheckResponse<TData = unknown> {
  statusCode: number
  data?: TData
}

export type ProviderHealthCheckRequester = <TData = unknown>(
  request: ProviderHealthCheckRequest,
) => Promise<ProviderHealthCheckResponse<TData>>

export interface ProviderHandshakeResult {
  status: 'success' | 'error'
  message: '连通成功' | 'Key值错误' | '网络连通异常'
  statusCode: number
}

interface ProviderHealthCheckEndpoint {
  url: string
  header: Record<string, string>
}

export function resolveProviderHealthCheckEndpoint(
  provider: HandshakeProvider,
  apiKey: string,
): ProviderHealthCheckEndpoint {
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      header: {},
    }
  }

  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/models',
      header: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  }

  if (provider === 'qwen') {
    return {
      url: 'https://dashscope.aliyuncs.com/api/v1/models',
      header: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  }

  return {
    url: 'https://api.deepseek.com/models',
    header: {
      Authorization: `Bearer ${apiKey}`,
    },
  }
}

function normalizeConnectivityErrorMessage(error: unknown): ProviderHandshakeResult['message'] {
  const errMsg = String((error as { errMsg?: unknown })?.errMsg || '').toLowerCase()
  if (errMsg.includes('timeout') || errMsg.includes('timed out') || errMsg.includes('超时')) {
    return '网络连通异常'
  }
  return '网络连通异常'
}

export async function probeProviderApiKey(
  provider: HandshakeProvider,
  apiKey: string,
  timeoutMs: number,
  requester: ProviderHealthCheckRequester,
): Promise<ProviderHandshakeResult> {
  const endpoint = resolveProviderHealthCheckEndpoint(provider, apiKey)

  try {
    const response = await requester({
      url: endpoint.url,
      method: 'GET',
      timeout: timeoutMs,
      header: endpoint.header,
    })

    const statusCode = Math.max(0, Math.floor(Number(response?.statusCode || 0)))
    if (statusCode >= 200 && statusCode < 300) {
      return {
        status: 'success',
        message: '连通成功',
        statusCode,
      }
    }

    if (statusCode === 401 || statusCode === 403) {
      return {
        status: 'error',
        message: 'Key值错误',
        statusCode,
      }
    }

    return {
      status: 'error',
      message: '网络连通异常',
      statusCode,
    }
  } catch (error) {
    return {
      status: 'error',
      message: normalizeConnectivityErrorMessage(error),
      statusCode: 0,
    }
  }
}
