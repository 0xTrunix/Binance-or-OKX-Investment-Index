const fs = require("fs");

const BINANCE_URL = "https://data-api.binance.vision/api/v3/exchangeInfo";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";
const CMC_URL = "https://s2.coinmarketcap.com/generated/search/quick_search.json";
const MARKET_PAGES = 5;
const PAGE_SIZE = 250;

const manualCoinGeckoIds = {
  BEAMX: "beam-2",
  RONIN: "ronin",
  VELODROME: "velodrome-finance",
  D: "dar-open-network",
  SHELL: "myshell",
  BMT: "bubblemaps",
  EDEN: "openeden",
  NOM: "nomina",
  SCR: "scroll",
  PIXEL: "pixels",
  HIGH: "highstreet",
  SYN: "synapse-2",
  VIC: "tomochain",
  COOKIE: "cookie",
  TURTLE: "turtle-2",
  "1000CHEEMS": "cheems-token",
  "1000SATS": "sats-ordinals",
  "1MBABYDOGE": "baby-doge-coin",
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "BinanceSpotFDVScreener/1.0",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 1500);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError.message}`);
}

function readJsonIfExists(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function compactPairList(pairs) {
  const priority = ["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB", "TRY", "EUR"];
  return pairs.sort((a, b) => {
    const aIndex = priority.findIndex((quote) => a.endsWith(quote));
    const bIndex = priority.findIndex((quote) => b.endsWith(quote));
    const normalizedA = aIndex === -1 ? priority.length : aIndex;
    const normalizedB = bIndex === -1 ? priority.length : bIndex;
    return normalizedA - normalizedB || a.localeCompare(b);
  });
}

function cmcSlugFromUrl(url) {
  return url?.match(/\/currencies\/([^/]+)\//)?.[1] || null;
}

async function main() {
  const existingData = readJsonIfExists("assets-data.json", { rows: [] });
  const existingByAsset = new Map(existingData.rows.map((row) => [row.asset, row]));
  const futuresByAsset = new Map(
    existingData.rows
      .filter((row) => row.futuresPairs?.length)
      .map((row) => [row.asset, row.futuresPairs]),
  );
  const generatedSlugs = readJsonIfExists("cmc-slugs.json", {});

  const exchangeInfo = await fetchJson(BINANCE_URL);
  const spotByAsset = new Map();
  for (const symbol of exchangeInfo.symbols) {
    if (symbol.status !== "TRADING" || !symbol.isSpotTradingAllowed) continue;
    if (!spotByAsset.has(symbol.baseAsset)) spotByAsset.set(symbol.baseAsset, []);
    spotByAsset.get(symbol.baseAsset).push(symbol.symbol);
  }

  const markets = [];
  for (let page = 1; page <= MARKET_PAGES; page += 1) {
    const params = new URLSearchParams({
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: String(PAGE_SIZE),
      page: String(page),
      sparkline: "false",
    });
    const pageRows = await fetchJson(`${COINGECKO_URL}?${params}`);
    markets.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    await wait(1250);
  }

  const cmcQuick = await fetchJson(CMC_URL);
  const marketById = new Map(markets.map((coin) => [coin.id, coin]));
  const marketsBySymbol = new Map();
  for (const coin of markets) {
    const symbol = coin.symbol.toUpperCase();
    if (!marketsBySymbol.has(symbol)) marketsBySymbol.set(symbol, []);
    marketsBySymbol.get(symbol).push(coin);
  }
  for (const candidates of marketsBySymbol.values()) {
    candidates.sort((a, b) => (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999));
  }

  const cmcBySymbol = new Map();
  for (const coin of cmcQuick) {
    const symbol = coin.symbol.toUpperCase();
    if (!cmcBySymbol.has(symbol)) cmcBySymbol.set(symbol, []);
    cmcBySymbol.get(symbol).push(coin);
  }
  for (const candidates of cmcBySymbol.values()) {
    candidates.sort((a, b) => (a.rank || 999999) - (b.rank || 999999));
  }

  const rows = [...spotByAsset.entries()].map(([asset, pairs]) => {
    const existing = existingByAsset.get(asset);
    const preferredId = manualCoinGeckoIds[asset] || existing?.coinGeckoId;
    const coin = (preferredId && marketById.get(preferredId)) || marketsBySymbol.get(asset)?.[0] || null;
    const existingSlug = cmcSlugFromUrl(existing?.cmcUrl);
    const cmcSlug = existingSlug || generatedSlugs[asset] || cmcBySymbol.get(asset)?.[0]?.slug || null;

    return {
      asset,
      name: coin?.name || existing?.name || asset,
      fdv: coin?.fully_diluted_valuation ?? existing?.fdv ?? null,
      marketCap: coin?.market_cap ?? existing?.marketCap ?? null,
      rank: coin?.market_cap_rank ?? existing?.rank ?? null,
      price: coin?.current_price ?? existing?.price ?? null,
      coinGeckoId: coin?.id || preferredId || null,
      spotPairs: compactPairList(pairs),
      hasBinanceFutures: futuresByAsset.has(asset),
      futuresPairs: futuresByAsset.get(asset) || [],
      cmcUrl: cmcSlug ? `https://coinmarketcap.com/currencies/${cmcSlug}/` : null,
      dataStatus: coin
        ? (coin.fully_diluted_valuation ? "ok" : "no_fdv")
        : (existing?.fdv ? "existing_fallback" : "unmatched"),
    };
  });

  rows.sort((a, b) => (b.fdv || 0) - (a.fdv || 0) || a.asset.localeCompare(b.asset));

  const output = {
    generatedAt: new Date().toISOString(),
    criteria: "All distinct base assets with at least one currently trading Binance spot pair.",
    counts: {
      spotAssets: rows.length,
      withFdv: rows.filter((row) => row.fdv).length,
      withoutFdv: rows.filter((row) => !row.fdv).length,
      withBinanceFutures: rows.filter((row) => row.hasBinanceFutures).length,
    },
    sources: [BINANCE_URL, COINGECKO_URL, CMC_URL],
    notes: [
      "Rows are sorted by FDV descending; assets without FDV appear last.",
      "Existing verified CoinGecko IDs are reused before unique symbol matching.",
      "Existing recent FDV values are retained when a low-ranked asset is outside the fetched CoinGecko market pages.",
      "Binance futures status follows the verified spot-plus-futures dataset used by the main screener.",
      "FDV is point-in-time market data and changes with price and supply.",
    ],
    rows,
  };

  fs.writeFileSync("spot-assets-data.json", `${JSON.stringify(output, null, 2)}\n`);
  console.log(output.counts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
