const fs = require("fs");

const BINANCE_SPOT_URL = "https://data-api.binance.vision/api/v3/exchangeInfo";
const BINANCE_FUTURES_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const ID_BATCH_SIZE = 100;
const REQUEST_DELAY_MS = 3500;

const spotQuotesForMainList = new Set(["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB"]);
const futuresQuotes = new Set(["USDT", "USDC"]);

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

function getCoinGeckoCandidates() {
  const mode = process.env.COINGECKO_API_MODE?.trim().toLowerCase();
  const candidates = [
    {
      mode: "pro",
      baseUrl: "https://pro-api.coingecko.com/api/v3",
      headerName: "x-cg-pro-api-key",
    },
    {
      mode: "demo",
      baseUrl: "https://api.coingecko.com/api/v3",
      headerName: "x-cg-demo-api-key",
    },
  ];
  if (!mode) return candidates;
  const prioritized = candidates.filter((candidate) => candidate.mode === mode);
  return prioritized.length ? prioritized.concat(candidates.filter((candidate) => candidate.mode !== mode)) : candidates;
}

function readJsonIfExists(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchJson(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "BinanceCoinGeckoDataUpdater/1.0",
        },
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.status = response.status;
        error.retryAfter = Number(response.headers.get("retry-after") || 0);
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const backoff = error.status === 429
          ? Math.max(error.retryAfter * 1000, attempt * 20000)
          : attempt * 2500;
        await wait(backoff);
      }
    }
  }
  const wrappedError = new Error(`Failed to fetch ${url}: ${lastError.message}`);
  wrappedError.status = lastError.status;
  wrappedError.retryAfter = lastError.retryAfter;
  throw wrappedError;
}

async function fetchJsonWithHeaders(url, headers, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "BinanceCoinGeckoDataUpdater/1.0",
          ...headers,
        },
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.status = response.status;
        error.retryAfter = Number(response.headers.get("retry-after") || 0);
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const backoff = error.status === 429
          ? Math.max(error.retryAfter * 1000, attempt * 20000)
          : attempt * 2500;
        await wait(backoff);
      }
    }
  }
  const wrappedError = new Error(`Failed to fetch ${url}: ${lastError.message}`);
  wrappedError.status = lastError.status;
  wrappedError.retryAfter = lastError.retryAfter;
  throw wrappedError;
}

async function resolveCoinGeckoConfig() {
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  if (!apiKey) {
    return {
      baseUrl: "https://api.coingecko.com/api/v3",
      headers: {},
      authMode: "public",
    };
  }

  const candidates = getCoinGeckoCandidates();
  let lastError;
  for (const candidate of candidates) {
    try {
      await fetchJsonWithHeaders(`${candidate.baseUrl}/ping`, {
        [candidate.headerName]: apiKey,
      }, 2);
      return {
        baseUrl: candidate.baseUrl,
        headers: {
          [candidate.headerName]: apiKey,
        },
        authMode: candidate.mode,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Unable to authenticate CoinGecko API key: ${lastError?.message || "unknown error"}`);
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function addPair(map, asset, symbol) {
  if (!map.has(asset)) map.set(asset, []);
  map.get(asset).push(symbol);
}

function compactPairList(pairs, priority = ["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB", "TRY", "EUR"]) {
  return [...pairs].sort((a, b) => {
    const aIndex = priority.findIndex((quote) => a.endsWith(quote));
    const bIndex = priority.findIndex((quote) => b.endsWith(quote));
    const normalizedA = aIndex === -1 ? priority.length : aIndex;
    const normalizedB = bIndex === -1 ? priority.length : bIndex;
    return normalizedA - normalizedB || a.localeCompare(b);
  });
}

function buildSpotMaps(exchangeInfo) {
  const allSpot = new Map();
  const quotedSpot = new Map();
  for (const symbol of exchangeInfo.symbols) {
    if (symbol.status !== "TRADING" || !symbol.isSpotTradingAllowed) continue;
    addPair(allSpot, symbol.baseAsset, symbol.symbol);
    if (spotQuotesForMainList.has(symbol.quoteAsset)) {
      addPair(quotedSpot, symbol.baseAsset, symbol.symbol);
    }
  }
  return { allSpot, quotedSpot };
}

function buildFuturesMap(exchangeInfo) {
  const futuresByAsset = new Map();
  for (const symbol of exchangeInfo.symbols) {
    if (
      symbol.status !== "TRADING" ||
      symbol.contractType !== "PERPETUAL" ||
      !futuresQuotes.has(symbol.quoteAsset) ||
      symbol.underlyingType === "EQUITY"
    ) {
      continue;
    }
    addPair(futuresByAsset, symbol.baseAsset, symbol.symbol);
  }
  return futuresByAsset;
}

function buildCachedFuturesMap(existingMainData, existingSpotData) {
  const futuresByAsset = new Map();
  for (const row of [...existingMainData.rows, ...existingSpotData.rows]) {
    if (row.futuresPairs?.length) futuresByAsset.set(row.asset, [...row.futuresPairs]);
  }
  return futuresByAsset;
}

async function fetchBinanceCoinGeckoIds(existingMapping, spotAssets, coinGecko) {
  const refreshed = { ...existingMapping };
  for (let page = 1; page <= 25; page += 1) {
    const tickersPage = await fetchJsonWithHeaders(
      `${coinGecko.baseUrl}/exchanges/binance/tickers?page=${page}`,
      coinGecko.headers,
    );
    const tickers = tickersPage.tickers || [];
    if (!tickers.length) break;
    for (const ticker of tickers) {
      if (ticker.base && ticker.coin_id && spotAssets.has(ticker.base)) {
        refreshed[ticker.base] = ticker.coin_id;
      }
    }
    if (tickers.length < 100) break;
    await wait(REQUEST_DELAY_MS);
  }
  return sortedObject(refreshed);
}

async function fetchMarketsById(ids) {
  return fetchMarketsByIdWithConfig(ids, {
    baseUrl: "https://api.coingecko.com/api/v3",
    headers: {},
  });
}

async function fetchMarketsByIdWithConfig(ids, coinGecko) {
  const marketById = new Map();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  for (let index = 0; index < uniqueIds.length; index += ID_BATCH_SIZE) {
    const params = new URLSearchParams({
      vs_currency: "usd",
      ids: uniqueIds.slice(index, index + ID_BATCH_SIZE).join(","),
      per_page: String(ID_BATCH_SIZE),
      sparkline: "false",
    });
    const rows = await fetchJsonWithHeaders(`${coinGecko.baseUrl}/coins/markets?${params}`, coinGecko.headers);
    for (const coin of rows) marketById.set(coin.id, coin);
    await wait(REQUEST_DELAY_MS);
  }
  return marketById;
}

async function fetchCoinGeckoCategory(category, coinGecko) {
  const rows = [];
  for (let page = 1; page <= 5; page += 1) {
    const params = new URLSearchParams({
      vs_currency: "usd",
      category,
      per_page: "250",
      page: String(page),
      sparkline: "false",
    });
    const pageRows = await fetchJsonWithHeaders(`${coinGecko.baseUrl}/coins/markets?${params}`, coinGecko.headers);
    rows.push(...pageRows);
    if (pageRows.length < 250) break;
    await wait(REQUEST_DELAY_MS);
  }
  return rows;
}

function buildCoinGeckoPortfolio(entries, label, sourceUrl) {
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
  return { byId, bySymbol, sourceUrl };
}

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
      sourceUrl: portfolio.sourceUrl,
      matchType: "symbol_ambiguous",
      matchedName: matches.map((entry) => entry.name).join(" / "),
      matchedId: matches.map((entry) => entry.id).join(" / "),
      review: true,
    };
  }
  return {
    invested: false,
    source: "CoinGecko portfolio category",
    sourceUrl: portfolio.sourceUrl,
    matchType: "not_listed",
    matchedName: "",
    matchedId: "",
    review: false,
  };
}

function getPreferredId(asset, mapping, overrides) {
  return mapping[asset] || overrides[asset] || manualCoinGeckoIds[asset] || null;
}

function buildMarketFields(asset, preferredId, marketById, existingByAsset) {
  const existing = existingByAsset.get(asset);
  const coin = preferredId ? marketById.get(preferredId) : null;
  const coinGeckoId = coin?.id || preferredId || null;
  return {
    name: coin?.name || existing?.name || asset,
    fdv: coin?.fully_diluted_valuation ?? existing?.fdv ?? null,
    marketCap: coin?.market_cap ?? existing?.marketCap ?? null,
    rank: coin?.market_cap_rank ?? existing?.rank ?? null,
    price: coin?.current_price ?? existing?.price ?? null,
    change24h: coin?.price_change_percentage_24h ?? existing?.change24h ?? null,
    coinGeckoId,
    coinGeckoUrl: coinGeckoId ? `https://www.coingecko.com/en/coins/${coinGeckoId}` : null,
    dataStatus: coin
      ? (coin.fully_diluted_valuation ? "ok" : "no_fdv")
      : (existing?.fdv ? "existing_fallback" : "unmatched"),
  };
}

async function main() {
  const coinGecko = await resolveCoinGeckoConfig();
  const existingMainData = readJsonIfExists("assets-data.json", { rows: [] });
  const existingSpotData = readJsonIfExists("spot-assets-data.json", { rows: [] });
  const existingByAsset = new Map(
    [...existingMainData.rows, ...existingSpotData.rows].map((row) => [row.asset, row]),
  );
  const idOverrides = readJsonIfExists("coingecko-id-overrides.json", {});

  const spotExchangeInfo = await fetchJson(BINANCE_SPOT_URL);
  let futuresByAsset;
  let futuresSource = BINANCE_FUTURES_URL;
  let futuresNote = "Binance futures status is refreshed from Binance USD-M perpetual exchangeInfo.";
  try {
    const futuresExchangeInfo = await fetchJson(BINANCE_FUTURES_URL);
    futuresByAsset = buildFuturesMap(futuresExchangeInfo);
  } catch (error) {
    if (error.status !== 451) throw error;
    futuresByAsset = buildCachedFuturesMap(existingMainData, existingSpotData);
    futuresSource = `${BINANCE_FUTURES_URL} (cached fallback due to 451 region restriction)`;
    futuresNote = "Binance USD-M futures exchangeInfo was unavailable from the current region, so the previous verified futures mapping was retained.";
  }

  const { allSpot, quotedSpot } = buildSpotMaps(spotExchangeInfo);
  const refreshedMapping = await fetchBinanceCoinGeckoIds(
    readJsonIfExists("coingecko-binance-ids.json", {}),
    new Set(allSpot.keys()),
    coinGecko,
  );
  writeJson("coingecko-binance-ids.json", refreshedMapping);

  const allAssets = new Set([...allSpot.keys(), ...quotedSpot.keys()].filter(Boolean));
  const preferredIds = [...allAssets].map((asset) => getPreferredId(asset, refreshedMapping, idOverrides));
  const marketById = await fetchMarketsByIdWithConfig(preferredIds, coinGecko);
  const [yziRows, okxRows] = await Promise.all([
    fetchCoinGeckoCategory("yzi-labs-portfolio", coinGecko),
    fetchCoinGeckoCategory("okx-ventures-portfolio", coinGecko),
  ]);
  writeJson("cg_yzi_api.json", yziRows);
  writeJson("cg_okx_api.json", okxRows);

  const yziPortfolio = buildCoinGeckoPortfolio(
    yziRows,
    "CoinGecko YZi Labs Portfolio",
    "https://www.coingecko.com/en/categories/yzi-labs-portfolio",
  );
  const okxPortfolio = buildCoinGeckoPortfolio(
    okxRows,
    "CoinGecko OKX Ventures Portfolio",
    "https://www.coingecko.com/en/categories/okx-ventures-portfolio",
  );

  const spotRows = [...allSpot.entries()].map(([asset, pairs]) => {
    const preferredId = getPreferredId(asset, refreshedMapping, idOverrides);
    const fields = buildMarketFields(asset, preferredId, marketById, existingByAsset);
    return {
      asset,
      name: fields.name,
      fdv: fields.fdv,
      marketCap: fields.marketCap,
      rank: fields.rank,
      price: fields.price,
      coinGeckoId: fields.coinGeckoId,
      coinGeckoUrl: fields.coinGeckoUrl,
      mappingSource: refreshedMapping[asset] ? "coingecko_binance_ticker" : (preferredId ? "verified_id_fallback" : "unmatched"),
      spotPairs: compactPairList(pairs),
      hasBinanceFutures: futuresByAsset.has(asset),
      futuresPairs: compactPairList(futuresByAsset.get(asset) || []),
      dataStatus: fields.dataStatus,
    };
  });

  spotRows.sort((a, b) => (b.fdv || 0) - (a.fdv || 0) || a.asset.localeCompare(b.asset));

  const mainRows = [...quotedSpot.keys()]
    .filter((asset) => futuresByAsset.has(asset))
    .map((asset) => {
      const preferredId = getPreferredId(asset, refreshedMapping, idOverrides);
      const fields = buildMarketFields(asset, preferredId, marketById, existingByAsset);
      const row = {
        asset,
        name: fields.name,
        fdv: fields.fdv,
        marketCap: fields.marketCap,
        rank: fields.rank,
        price: fields.price,
        change24h: fields.change24h,
        yziLabs: false,
        okxVentures: false,
        coinGeckoId: fields.coinGeckoId,
        coinGeckoUrl: fields.coinGeckoUrl,
        spotPairs: compactPairList(quotedSpot.get(asset)),
        futuresPairs: compactPairList(futuresByAsset.get(asset), ["USDT", "USDC"]),
        dataStatus: fields.dataStatus,
      };
      const yzi = verifyInvestment(row, yziPortfolio);
      const okx = verifyInvestment(row, okxPortfolio);
      row.yziLabs = yzi.invested;
      row.okxVentures = okx.invested;
      row.investmentVerification = { yziLabs: yzi, okxVentures: okx };
      row.investmentSourceSummary = [
        row.yziLabs ? `YZi:${yzi.matchType}` : null,
        row.okxVentures ? `OKX:${okx.matchType}` : null,
      ].filter(Boolean).join("; ") || "not_listed";
      return row;
    });

  mainRows.sort((a, b) => (b.fdv || 0) - (a.fdv || 0) || a.asset.localeCompare(b.asset));

  const generatedAt = new Date().toISOString();
  const commonSources = [
    BINANCE_SPOT_URL,
    futuresSource,
    `${coinGecko.baseUrl}/coins/markets`,
    `${coinGecko.baseUrl}/exchanges/binance/tickers`,
  ];

  writeJson("spot-assets-data.json", {
    generatedAt,
    criteria: "All distinct base assets with at least one currently trading Binance spot pair.",
    counts: {
      spotAssets: spotRows.length,
      withFdv: spotRows.filter((row) => row.fdv).length,
      withoutFdv: spotRows.filter((row) => !row.fdv).length,
      withBinanceFutures: spotRows.filter((row) => row.hasBinanceFutures).length,
    },
    sources: commonSources,
    notes: [
      "Rows are sorted by FDV descending; assets without FDV appear last.",
      "CoinGecko IDs are verified against CoinGecko's Binance exchange ticker mapping before market data and links are generated.",
      "Coin links and FDV use the same CoinGecko ID; symbol-only URL guessing is not used.",
      futuresNote,
      "FDV is point-in-time market data and changes with price and supply.",
    ],
    rows: spotRows,
  });

  writeJson("assets-data.json", {
    generatedAt,
    criteria: "Assets with Binance spot trading enabled and Binance USD-M perpetual futures trading enabled.",
    counts: {
      spotAssets: quotedSpot.size,
      futuresAssets: futuresByAsset.size,
      matchedAssets: mainRows.length,
      withFdv: mainRows.filter((row) => row.fdv).length,
      yziLabs: mainRows.filter((row) => row.yziLabs).length,
      okxVentures: mainRows.filter((row) => row.okxVentures).length,
      needsInvestmentReview: mainRows.filter(
        (row) => row.investmentVerification?.yziLabs?.review || row.investmentVerification?.okxVentures?.review,
      ).length,
    },
    sources: [
      ...commonSources,
      `${coinGecko.baseUrl}/coins/markets?category=yzi-labs-portfolio`,
      `${coinGecko.baseUrl}/coins/markets?category=okx-ventures-portfolio`,
    ],
    notes: [
      "Investment tags are verified against CoinGecko portfolio category membership, primarily by CoinGecko ID; unique-symbol fallback is flagged for review.",
      "Coin links and market data are generated from the same verified CoinGecko ID; symbol-only URL guessing is not used.",
      "Binance multiplier assets such as 1000SATS and 1MBABYDOGE use their exchange-specific CoinGecko IDs.",
    ],
    rows: mainRows,
  });

  console.log({
    coinGeckoAuthMode: coinGecko.authMode,
    generatedAt,
    spot: {
      spotAssets: spotRows.length,
      withFdv: spotRows.filter((row) => row.fdv).length,
      withBinanceFutures: spotRows.filter((row) => row.hasBinanceFutures).length,
    },
    main: {
      matchedAssets: mainRows.length,
      withFdv: mainRows.filter((row) => row.fdv).length,
      yziLabs: mainRows.filter((row) => row.yziLabs).length,
      okxVentures: mainRows.filter((row) => row.okxVentures).length,
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
