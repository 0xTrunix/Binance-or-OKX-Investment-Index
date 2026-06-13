const fs = require("fs");

const BINANCE_URL = "https://data-api.binance.vision/api/v3/exchangeInfo";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";
const ID_BATCH_SIZE = 200;

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
  TURTLE: "turtle-4",
  AI: "sleepless-ai",
  FRAX: "frax-share",
  TREE: "treehouse",
  "1000CHEEMS": "1000chems",
  "1000SATS": "1000sats-ordinals",
  "1MBABYDOGE": "1mbabydoge",
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
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(error.status === 429 ? attempt * 10000 : attempt * 1500);
      }
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

async function main() {
  const existingData = readJsonIfExists("assets-data.json", { rows: [] });
  const existingByAsset = new Map(existingData.rows.map((row) => [row.asset, row]));
  const futuresByAsset = new Map(
    existingData.rows
      .filter((row) => row.futuresPairs?.length)
      .map((row) => [row.asset, row.futuresPairs]),
  );
  const binanceCoinGeckoIds = readJsonIfExists("coingecko-binance-ids.json", {});
  const verifiedIdOverrides = readJsonIfExists("coingecko-id-overrides.json", {});

  const exchangeInfo = await fetchJson(BINANCE_URL);
  const spotByAsset = new Map();
  for (const symbol of exchangeInfo.symbols) {
    if (symbol.status !== "TRADING" || !symbol.isSpotTradingAllowed) continue;
    if (!spotByAsset.has(symbol.baseAsset)) spotByAsset.set(symbol.baseAsset, []);
    spotByAsset.get(symbol.baseAsset).push(symbol.symbol);
  }

  const preferredIds = [...spotByAsset.keys()]
    .map((asset) => binanceCoinGeckoIds[asset] || verifiedIdOverrides[asset] || manualCoinGeckoIds[asset])
    .filter(Boolean);
  const marketById = new Map();
  const exactIds = [...new Set(preferredIds)];
  for (let index = 0; index < exactIds.length; index += ID_BATCH_SIZE) {
    const params = new URLSearchParams({
      vs_currency: "usd",
      ids: exactIds.slice(index, index + ID_BATCH_SIZE).join(","),
      per_page: String(ID_BATCH_SIZE),
      sparkline: "false",
    });
    const exactRows = await fetchJson(`${COINGECKO_URL}?${params}`);
    for (const coin of exactRows) {
      marketById.set(coin.id, coin);
    }
    await wait(2500);
  }

  const rows = [...spotByAsset.entries()].map(([asset, pairs]) => {
    const existing = existingByAsset.get(asset);
    const exchangeId = binanceCoinGeckoIds[asset];
    const overrideId = verifiedIdOverrides[asset] || manualCoinGeckoIds[asset];
    const preferredId = exchangeId || overrideId;
    const coin = preferredId ? marketById.get(preferredId) : null;
    const coinGeckoId = coin?.id || preferredId || null;

    return {
      asset,
      name: coin?.name || existing?.name || asset,
      fdv: coin?.fully_diluted_valuation ?? existing?.fdv ?? null,
      marketCap: coin?.market_cap ?? existing?.marketCap ?? null,
      rank: coin?.market_cap_rank ?? existing?.rank ?? null,
      price: coin?.current_price ?? existing?.price ?? null,
      coinGeckoId,
      coinGeckoUrl: coinGeckoId ? `https://www.coingecko.com/en/coins/${coinGeckoId}` : null,
      mappingSource: exchangeId ? "coingecko_binance_ticker" : (overrideId ? "verified_id_fallback" : "unmatched"),
      spotPairs: compactPairList(pairs),
      hasBinanceFutures: futuresByAsset.has(asset),
      futuresPairs: futuresByAsset.get(asset) || [],
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
    sources: [
      BINANCE_URL,
      COINGECKO_URL,
      "https://api.coingecko.com/api/v3/exchanges/binance/tickers",
    ],
    notes: [
      "Rows are sorted by FDV descending; assets without FDV appear last.",
      "CoinGecko IDs are verified against CoinGecko's Binance exchange ticker mapping before market data and links are generated.",
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
