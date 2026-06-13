const fs = require("fs");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readText = (file) => fs.readFileSync(file, "utf8");

const spot = readJson("spot_exchangeInfo.json");
const futures = readJson("futures_exchangeInfo.json");

const spotQuotes = new Set(["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB"]);
const futuresQuotes = new Set(["USDT", "USDC"]);

const spotByAsset = new Map();
for (const s of spot.symbols) {
  if (s.status !== "TRADING" || !s.isSpotTradingAllowed || !spotQuotes.has(s.quoteAsset)) continue;
  if (!spotByAsset.has(s.baseAsset)) spotByAsset.set(s.baseAsset, []);
  spotByAsset.get(s.baseAsset).push(s.symbol);
}

const futuresByAsset = new Map();
for (const s of futures.symbols) {
  if (
    s.status !== "TRADING" ||
    s.contractType !== "PERPETUAL" ||
    !futuresQuotes.has(s.quoteAsset) ||
    s.underlyingType === "EQUITY"
  ) {
    continue;
  }
  if (!futuresByAsset.has(s.baseAsset)) futuresByAsset.set(s.baseAsset, []);
  futuresByAsset.get(s.baseAsset).push(s.symbol);
}

const assets = [...spotByAsset.keys()].filter((asset) => futuresByAsset.has(asset)).sort();

const markets = [];
for (let i = 1; i <= 5; i += 1) markets.push(...readJson(`cg_markets_${i}.json`));
markets.push(...readJson("cg_missing_markets.json"));

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

const binanceCoinGeckoIds = fs.existsSync("coingecko-binance-ids.json")
  ? readJson("coingecko-binance-ids.json")
  : {};
const verifiedIdOverrides = fs.existsSync("coingecko-id-overrides.json")
  ? readJson("coingecko-id-overrides.json")
  : {};

const marketById = new Map(markets.map((coin) => [coin.id, coin]));
const marketsBySymbol = new Map();
for (const coin of markets) {
  const symbol = coin.symbol.toUpperCase();
  if (!marketsBySymbol.has(symbol)) marketsBySymbol.set(symbol, []);
  marketsBySymbol.get(symbol).push(coin);
}
for (const coins of marketsBySymbol.values()) {
  coins.sort((a, b) => (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999));
}

function buildCoinGeckoPortfolio(file, label, sourceUrl) {
  const entries = fs.existsSync(file) ? readJson(file) : [];
  const byId = new Map();
  const bySymbol = new Map();
  for (const coin of entries) {
    const entry = {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      source: label,
      sourceUrl,
    };
    byId.set(entry.id, entry);
    if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, []);
    bySymbol.get(entry.symbol).push(entry);
  }
  return { byId, bySymbol };
}

const yziPortfolio = buildCoinGeckoPortfolio(
  "cg_yzi_api.json",
  "CoinGecko YZi Labs Portfolio",
  "https://www.coingecko.com/en/categories/yzi-labs-portfolio",
);
const okxPortfolio = buildCoinGeckoPortfolio(
  "cg_okx_api.json",
  "CoinGecko OKX Ventures Portfolio",
  "https://www.coingecko.com/en/categories/okx-ventures-portfolio",
);

function verifyInvestment(row, portfolio) {
  if (row.coinGeckoId && portfolio.byId.has(row.coinGeckoId)) {
    const entry = portfolio.byId.get(row.coinGeckoId);
    return {
      invested: true,
      source: entry.source,
      sourceUrl: entry.sourceUrl,
      matchType: "coingecko_id",
      matchedName: entry.name,
      matchedId: entry.id,
      review: false,
    };
  }
  const matches = portfolio.bySymbol.get(row.asset) || [];
  if (matches.length === 1) {
    const entry = matches[0];
    return {
      invested: true,
      source: entry.source,
      sourceUrl: entry.sourceUrl,
      matchType: "symbol_unique",
      matchedName: entry.name,
      matchedId: entry.id,
      review: row.coinGeckoId ? row.coinGeckoId !== entry.id : true,
    };
  }
  if (matches.length > 1) {
    return {
      invested: false,
      source: "CoinGecko portfolio category",
      sourceUrl: matches[0].sourceUrl,
      matchType: "symbol_ambiguous",
      matchedName: matches.map((entry) => entry.name).join(" / "),
      matchedId: matches.map((entry) => entry.id).join(" / "),
      review: true,
    };
  }
  return {
    invested: false,
    source: "CoinGecko portfolio category",
    sourceUrl: portfolio === yziPortfolio
      ? "https://www.coingecko.com/en/categories/yzi-labs-portfolio"
      : "https://www.coingecko.com/en/categories/okx-ventures-portfolio",
    matchType: "not_listed",
    matchedName: "",
    matchedId: "",
    review: false,
  };
}

function compactPairList(pairs) {
  const priority = ["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB"];
  return pairs.sort((a, b) => {
    const aq = priority.findIndex((q) => a.endsWith(q));
    const bq = priority.findIndex((q) => b.endsWith(q));
    return aq - bq || a.localeCompare(b);
  });
}

const rows = assets.map((asset) => {
  const preferredId = binanceCoinGeckoIds[asset] || verifiedIdOverrides[asset] || manualCoinGeckoIds[asset];
  const candidates = marketsBySymbol.get(asset) || [];
  const cgCoin =
    (preferredId && marketById.get(preferredId)) ||
    (candidates.length === 1 ? candidates[0] : null);
  const fdv = cgCoin?.fully_diluted_valuation ?? null;
  const marketCap = cgCoin?.market_cap ?? null;
  const rank = cgCoin?.market_cap_rank ?? null;
  const row = {
    asset,
    name: cgCoin?.name || asset,
    fdv,
    marketCap,
    rank,
    price: cgCoin?.current_price ?? null,
    change24h: cgCoin?.price_change_percentage_24h ?? null,
    coinGeckoId: cgCoin?.id || null,
    coinGeckoUrl: cgCoin?.id ? `https://www.coingecko.com/en/coins/${cgCoin.id}` : null,
    spotPairs: compactPairList(spotByAsset.get(asset)),
    futuresPairs: compactPairList(futuresByAsset.get(asset)),
    dataStatus: cgCoin ? (fdv ? "ok" : "no_fdv") : "unmatched",
  };
  const yzi = verifyInvestment(row, yziPortfolio);
  const okx = verifyInvestment(row, okxPortfolio);
  row.yziLabs = yzi.invested;
  row.okxVentures = okx.invested;
  row.investmentVerification = { yziLabs: yzi, okxVentures: okx };
  row.investmentSourceSummary = [row.yziLabs ? `YZi:${yzi.matchType}` : null, row.okxVentures ? `OKX:${okx.matchType}` : null]
    .filter(Boolean)
    .join("; ") || "not_listed";
  return row;
});

rows.sort((a, b) => (b.fdv || 0) - (a.fdv || 0) || a.asset.localeCompare(b.asset));

const source = {
  generatedAt: new Date().toISOString(),
  criteria: "Assets with Binance spot trading enabled and Binance USD-M perpetual futures trading enabled.",
  counts: {
    spotAssets: spotByAsset.size,
    futuresAssets: futuresByAsset.size,
    matchedAssets: rows.length,
    withFdv: rows.filter((row) => row.fdv).length,
    yziLabs: rows.filter((row) => row.yziLabs).length,
    okxVentures: rows.filter((row) => row.okxVentures).length,
    needsInvestmentReview: rows.filter(
      (row) => row.investmentVerification?.yziLabs?.review || row.investmentVerification?.okxVentures?.review,
    ).length,
  },
  sources: [
    "https://api.binance.com/api/v3/exchangeInfo",
    "https://fapi.binance.com/fapi/v1/exchangeInfo",
    "https://api.coingecko.com/api/v3/coins/markets",
    "https://api.coingecko.com/api/v3/coins/markets?category=yzi-labs-portfolio",
    "https://api.coingecko.com/api/v3/coins/markets?category=okx-ventures-portfolio",
  ],
  notes: [
    "Investment tags are verified against CoinGecko portfolio category membership, primarily by CoinGecko ID; unique-symbol fallback is flagged for review.",
    "Coin links are generated from the same verified CoinGecko IDs used for market data.",
    "Some Binance multiplier assets such as 1000SATS or 1MBABYDOGE are matched to their closest market-data token.",
  ],
  rows,
};

fs.writeFileSync("assets-data.json", `${JSON.stringify(source, null, 2)}\n`);
console.log(source.counts);
