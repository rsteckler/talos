import type { PluginLogger } from "@talos/shared/types";

// --- Configuration ---

const CANOPY_BASE = "https://rest.canopyapi.co/api/amazon";

let canopyApiKey = "";
let pluginLog: PluginLogger | null = null;

// --- Lifecycle ---

export async function start(credentials: Record<string, string>, logger: PluginLogger): Promise<void> {
  pluginLog = logger;
  canopyApiKey = credentials["canopy_api_key"] ?? "";
  if (!canopyApiKey) {
    logger.warn("No Canopy API key configured — search/browse will not work");
  }
  logger.info("Amazon Shopping plugin started");
}

export async function stop(): Promise<void> {
  pluginLog?.info("Amazon Shopping plugin stopped");
}

// --- Canopy API ---

async function canopyRequest(endpoint: string, params: Record<string, string>): Promise<unknown> {
  if (!canopyApiKey) {
    return { error: "Canopy API key not configured. Add it in plugin settings." };
  }

  const url = new URL(`${CANOPY_BASE}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { "API-KEY": canopyApiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `Canopy API error (${res.status}): ${text}` };
    }

    return await res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pluginLog?.error(`Canopy request failed: ${message}`);
    return { error: `Canopy API unavailable: ${message}` };
  }
}

// --- Response shaping ---

/** Build Amazon URLs from an ASIN. */
function buildAmazonLinks(asin: string, domain?: string): { buyLink: string; addToCartLink: string } {
  const host = domain ? (domain.startsWith("www.") ? domain : `www.${domain}`) : "www.amazon.com";
  return {
    buyLink: `https://${host}/dp/${asin}`,
    addToCartLink: `https://${host}/gp/aws/cart/add.html?ASIN.1=${asin}&Quantity.1=1`,
  };
}

interface SlimProduct {
  title: string;
  asin: string;
  price: string | null;
  rating: number | null;
  ratingsTotal: number | null;
  isPrime: boolean;
  buyLink: string;
  addToCartLink: string;
}

/**
 * Extract a slim product list from the Canopy search response.
 * Drops refinements, huge referral URLs, images, and other noise.
 */
function slimSearchResults(data: unknown, domain?: string): { products: SlimProduct[] } | unknown {
  if (data === null || typeof data !== "object") return data;

  const root = data as Record<string, unknown>;
  const inner = root["data"] as Record<string, unknown> | undefined;
  const search = inner?.["amazonProductSearchResults"] as Record<string, unknown> | undefined;
  const productResults = search?.["productResults"] as Record<string, unknown> | undefined;
  const results = productResults?.["results"] as Array<Record<string, unknown>> | undefined;

  if (!results || !Array.isArray(results)) return data;

  const products: SlimProduct[] = results.map((r) => {
    const asin = (r["asin"] as string) || "";
    const priceObj = r["price"] as Record<string, unknown> | null;
    const links = buildAmazonLinks(asin, domain);

    return {
      title: (r["title"] as string) || "",
      asin,
      price: priceObj?.["display"] as string | null ?? null,
      rating: (r["rating"] as number) ?? null,
      ratingsTotal: (r["ratingsTotal"] as number) ?? null,
      isPrime: (r["isPrime"] as boolean) ?? false,
      buyLink: links.buyLink,
      addToCartLink: links.addToCartLink,
    };
  });

  return { products };
}

/**
 * Extract essential fields from a Canopy product detail response.
 */
function slimProductDetails(data: unknown, domain?: string): unknown {
  if (data === null || typeof data !== "object") return data;

  const root = data as Record<string, unknown>;
  const inner = root["data"] as Record<string, unknown> | undefined;
  const product = inner?.["amazonProduct"] as Record<string, unknown> | undefined;

  if (!product) return data;

  const asin = (product["asin"] as string) || "";
  const links = asin ? buildAmazonLinks(asin, domain) : { buyLink: null, addToCartLink: null };

  return {
    title: product["title"],
    asin,
    brand: product["brand"],
    price: product["price"],
    rating: product["rating"],
    ratingsTotal: product["ratingsTotal"],
    description: product["description"],
    features: product["features"],
    availability: product["availability"],
    isPrime: product["isPrime"],
    categories: product["categories"],
    buyLink: links.buyLink,
    addToCartLink: links.addToCartLink,
  };
}

// --- Handlers ---

async function amazonSearch(args: Record<string, unknown>): Promise<unknown> {
  const searchTerm = args["search_term"] as string | undefined;
  if (!searchTerm) return { error: "search_term is required" };

  const params: Record<string, string> = { searchTerm };
  const domain = args["domain"] as string | undefined;

  if (domain) params["domain"] = domain;
  if (args["page"]) params["page"] = String(args["page"]);
  if (args["sort"]) params["sort"] = args["sort"] as string;
  if (args["min_price"]) params["minPrice"] = String(args["min_price"]);
  if (args["max_price"]) params["maxPrice"] = String(args["max_price"]);

  const result = await canopyRequest("/search", params);
  return slimSearchResults(result, domain);
}

async function amazonProductDetails(args: Record<string, unknown>): Promise<unknown> {
  const asin = args["asin"] as string | undefined;
  const url = args["url"] as string | undefined;
  if (!asin && !url) return { error: "Either asin or url is required" };

  const params: Record<string, string> = {};
  const domain = args["domain"] as string | undefined;

  if (asin) params["asin"] = asin;
  if (url) params["url"] = url;
  if (domain) params["domain"] = domain;

  const result = await canopyRequest("/product", params);
  return slimProductDetails(result, domain);
}

async function amazonProductReviews(args: Record<string, unknown>): Promise<unknown> {
  const asin = args["asin"] as string | undefined;
  const url = args["url"] as string | undefined;
  if (!asin && !url) return { error: "Either asin or url is required" };

  const params: Record<string, string> = {};
  if (asin) params["asin"] = asin;
  if (url) params["url"] = url;
  if (args["domain"]) params["domain"] = args["domain"] as string;

  return canopyRequest("/product/reviews", params);
}

// --- Exported handler map ---

export const handlers = {
  amazon_search: amazonSearch,
  amazon_product_details: amazonProductDetails,
  amazon_product_reviews: amazonProductReviews,
};
