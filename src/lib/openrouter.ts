// ============================================
// OpenRouter API Utility
// Replaces z-ai-web-dev-sdk with direct OpenRouter API calls
// ============================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

interface OpenRouterResponse {
  id: string
  choices: {
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Call OpenRouter LLM API with OpenAI-compatible format
 */
export async function callLLM(
  messages: ChatMessage[],
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  }
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  const model = options?.model || process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324'
  const timeoutMs = options?.timeoutMs || 45000

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://battle-of-questions.app',
        'X-Title': 'Battle of Questions',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[OpenRouter] API error ${response.status}: ${errorBody}`)
      return null
    }

    const data = (await response.json()) as OpenRouterResponse
    const content = data.choices?.[0]?.message?.content || null

    if (content) {
      console.log(`[OpenRouter] LLM response received (${content.length} chars, model: ${model})`)
    }

    return content
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[OpenRouter] LLM request timed out')
    } else {
      console.error('[OpenRouter] LLM request failed:', err.message)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Simple web search using DuckDuckGo HTML search
 * Returns search results as { title, snippet }[]
 */
export async function webSearch(
  query: string,
  options?: { timeoutMs?: number }
): Promise<Array<{ name: string; snippet: string }>> {
  const timeoutMs = options?.timeoutMs || 6000

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.error(`[WebSearch] DuckDuckGo returned ${response.status}`)
      return []
    }

    const html = await response.text()
    const results: Array<{ name: string; snippet: string }> = []

    // Parse DuckDuckGo HTML results
    const resultRegex = /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi
    let match

    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      const name = match[1].replace(/<[^>]*>/g, '').trim()
      const snippet = match[2].replace(/<[^>]*>/g, '').trim()
      if (name && snippet && snippet.length > 30) {
        results.push({ name, snippet })
      }
    }

    console.log(`[WebSearch] Found ${results.length} results for "${query}"`)
    return results
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[WebSearch] Search timed out')
    } else {
      console.error('[WebSearch] Search failed:', err.message)
    }
    return []
  }
}
