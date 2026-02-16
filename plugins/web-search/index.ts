interface SearchArgs {
  query: string;
  max_results?: number;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

async function search(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const { query, max_results } = args as unknown as SearchArgs;
  const apiKey = credentials?.["api_key"];

  if (!apiKey) {
    return { error: "Tavily API key is not configured." };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: max_results ?? 5,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { error: `Tavily API error (${response.status}): ${text}` };
  }

  const data = (await response.json()) as TavilyResponse;
  return {
    results: data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })),
  };
}

export const handlers = { search };
