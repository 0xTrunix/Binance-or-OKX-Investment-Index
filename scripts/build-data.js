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
  TURTLE: "turtle-2",
  "1000CHEEMS": "cheems-token",
};

const generatedCmcSlugs = fs.existsSync("cmc-slugs.json") ? readJson("cmc-slugs.json") : {};

const manualCmcSlugs = {
  BEAMX: "beam",
  RONIN: "ronin",
  VELODROME: "velodrome-finance",
  BMT: "bubblemaps",
  D: "dar-open-network",
  EDEN: "openeden",
  NOM: "nomina",
  SHELL: "myshell",
  WCT: "walletconnect-token",
  WLFI: "world-liberty-financial-wlfi",
  NXPC: "maplestory-universe",
  HOME: "defi-app",
  ROBO: "fabric-foundation",
  KMNO: "kamino-finance",
  YB: "yieldbasis",
  MIRA: "mira-network",
  GMT: "green-metaverse-token",
  EUL: "euler-finance",
  VANRY: "vanar",
  AIGENSYN: "gensyn",
  "1000SATS": "sats",
  "1MBABYDOGE": "babydoge-coin",
  ...generatedCmcSlugs,
};

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

function parsePortfolioHtml(file) {
  const html = readText(file);
  const entries = new Map();
  const coinRe = /\{"id":\d+,"name":"([^"]+)","symbol":"([^"]+)","slug":"([^"]+)"/g;
  let match;
  while ((match = coinRe.exec(html))) {
    const symbol = match[2].toUpperCase();
    if (!symbol || symbol === "USD" || symbol === "-") continue;
    entries.set(symbol, match[3]);
  }
  return entries;
}

const yziPortfolio = parsePortfolioHtml("cmc_yzi.html");
const okxPortfolio = parsePortfolioHtml("cmc_okx.html");

const cmcQuick = readJson("cmc_quick_search.json");
const cmcBySymbol = new Map();
for (const coin of cmcQuick) {
  const symbol = coin.symbol.toUpperCase();
  if (!cmcBySymbol.has(symbol)) cmcBySymbol.set(symbol, []);
  cmcBySymbol.get(symbol).push(coin);
}
for (const coins of cmcBySymbol.values()) coins.sort((a, b) => (a.rank || 999999) - (b.rank || 999999));

function cmcSlugFor(asset, cgCoin) {
  if (manualCmcSlugs[asset]) return manualCmcSlugs[asset];
  const quick = cmcBySymbol.get(asset)?.[0];
  if (quick) return quick.slug;
  if (yziPortfolio.has(asset)) return yziPortfolio.get(asset);
  if (okxPortfolio.has(asset)) return okxPortfolio.get(asset);
  if (cgCoin && cmcBySymbol.get(cgCoin.symbol.toUpperCase())?.[0]) {
    return cmcBySymbol.get(cgCoin.symbol.toUpperCase())[0].slug;
  }
  return null;
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
  const manualId = manualCoinGeckoIds[asset];
  const cgCoin = (manualId && marketById.get(manualId)) || marketsBySymbol.get(asset)?.[0] || null;
  const slug = cmcSlugFor(asset, cgCoin);
  const fdv = cgCoin?.fully_diluted_valuation ?? null;
  const marketCap = cgCoin?.market_cap ?? null;
  const rank = cgCoin?.market_cap_rank ?? null;
  return {
    asset,
    name: cgCoin?.name || asset,
    fdv,
    marketCap,
    rank,
    price: cgCoin?.current_price ?? null,
    change24h: cgCoin?.price_change_percentage_24h ?? null,
    yziLabs: yziPortfolio.has(asset) || (cgCoin && yziPortfolio.has(cgCoin.symbol.toUpperCase())),
    okxVentures: okxPortfolio.has(asset) || (cgCoin && okxPortfolio.has(cgCoin.symbol.toUpperCase())),
    cmcUrl: slug
      ? `https://coinmarketcap.com/currencies/${slug}/`
      : `https://coinmarketcap.com/search/?q=${encodeURIComponent(asset)}`,
    coinGeckoId: cgCoin?.id || null,
    spotPairs: compactPairList(spotByAsset.get(asset)),
    futuresPairs: compactPairList(futuresByAsset.get(asset)),
    dataStatus: cgCoin ? (fdv ? "ok" : "no_fdv") : "unmatched",
  };
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
  },
  sources: [
    "https://api.binance.com/api/v3/exchangeInfo",
    "https://fapi.binance.com/fapi/v1/exchangeInfo",
    "https://api.coingecko.com/api/v3/coins/markets",
    "https://coinmarketcap.com/view/binance-labs-portfolio/",
    "https://coinmarketcap.com/view/okx-ventures-portfolio/",
    "https://s2.coinmarketcap.com/generated/search/quick_search.json",
  ],
  notes: [
    "YZi Labs uses the former Binance Labs portfolio page where applicable.",
    "CMC direct links use CMC slugs when available; otherwise they fall back to CMC search links.",
    "Some Binance multiplier assets such as 1000SATS or 1MBABYDOGE are matched to their closest market-data token.",
  ],
  rows,
};

fs.writeFileSync("assets-data.json", `${JSON.stringify(source, null, 2)}\n`);
console.log(source.counts);
