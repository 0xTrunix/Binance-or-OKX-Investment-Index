const fs = require("fs");

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";
const CMC_VIEW_BASE_URL = "https://coinmarketcap.com/view";
const CMC_CURRENCY_BASE_URL = "https://coinmarketcap.com/currencies";
const CMC_BATCH_SIZE = 100;
const CMC_REQUEST_DELAY_MS = 1500;
const CMC_MAIN_QUOTES = ["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB"];

const yziTag = {
  slug: "binance-labs-portfolio",
  label: "YZi Labs Portfolio",
  url: `${CMC_VIEW_BASE_URL}/binance-labs-portfolio/`,
};

const okxTag = {
  slug: "okx-ventures-portfolio",
  label: "OKX Ventures Portfolio",
  url: `${CMC_VIEW_BASE_URL}/okx-ventures-portfolio/`,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithHeaders(url, headers, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "BinanceCMCDataUpdater/1.0",
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
          ? Math.max(error.retryAfter * 1000, attempt * 10000)
          : attempt * 2000;
        await wait(backoff);
      }
    }
  }
  const wrappedError = new Error(`Failed to fetch ${url}: ${lastError.message}`);
  wrappedError.status = lastError.status;
  throw wrappedError;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\(prev\.[^)]+\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugifyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\(prev\.[^)]+\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

async function resolveCmcConfig() {
  const apiKey = process.env.CMC_API_KEY?.trim();
  if (!apiKey) return null;

  await fetchJsonWithHeaders(`${CMC_BASE_URL}/v1/key/info`, {
    "X-CMC_PRO_API_KEY": apiKey,
  }, 2);

  return {
    baseUrl: CMC_BASE_URL,
    headers: {
      "X-CMC_PRO_API_KEY": apiKey,
    },
  };
}

async function fetchCmcMap(cmc) {
  const entries = [];
  for (let start = 1; start <= 10001; start += 5000) {
    const params = new URLSearchParams({
      listing_status: "active",
      sort: "cmc_rank",
      limit: "5000",
      start: String(start),
    });
    const response = await fetchJsonWithHeaders(`${cmc.baseUrl}/v1/cryptocurrency/map?${params}`, cmc.headers);
    const rows = response.data || [];
    entries.push(...rows);
    if (rows.length < 5000) break;
    await wait(CMC_REQUEST_DELAY_MS);
  }
  return entries;
}

function buildCmcIndexes(entries) {
  const byId = new Map();
  const bySymbol = new Map();
  for (const entry of entries) {
    byId.set(entry.id, entry);
    const symbol = String(entry.symbol || "").toUpperCase();
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(entry);
  }
  for (const group of bySymbol.values()) {
    group.sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER));
  }
  return { byId, bySymbol };
}

function resolveCmcEntry(asset, existingIdentity, cmcIndexes, overrides, previousMap) {
  const override = overrides[asset];
  if (override?.id && cmcIndexes.byId.has(override.id)) return cmcIndexes.byId.get(override.id);

  const previous = previousMap[asset];
  if (previous?.id && cmcIndexes.byId.has(previous.id)) return cmcIndexes.byId.get(previous.id);

  const candidates = (cmcIndexes.bySymbol.get(asset) || []).filter((entry) => entry.is_active === 1);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const existingName = normalizeText(existingIdentity?.name);
  const existingSlug = String(existingIdentity?.coinGeckoId || "").toLowerCase();
  const nameSlug = slugifyName(existingIdentity?.name);

  const slugMatch = candidates.find((entry) => entry.slug === existingSlug || entry.slug === nameSlug);
  if (slugMatch) return slugMatch;

  const nameMatches = candidates.filter((entry) => normalizeText(entry.name) === existingName);
  if (nameMatches.length === 1) return nameMatches[0];

  const looseNameMatches = candidates.filter((entry) => {
    const name = normalizeText(entry.name);
    return existingName && (name.includes(existingName) || existingName.includes(name));
  });
  if (looseNameMatches.length === 1) return looseNameMatches[0];

  return candidates[0];
}

async function fetchCmcQuotesById(entries, cmc) {
  const quoteById = new Map();
  const ids = [...new Set(entries.map((entry) => entry.id).filter(Boolean))];
  for (let index = 0; index < ids.length; index += CMC_BATCH_SIZE) {
    const params = new URLSearchParams({
      id: ids.slice(index, index + CMC_BATCH_SIZE).join(","),
      aux: "cmc_rank,tags,max_supply,total_supply,circulating_supply,num_market_pairs,platform",
    });
    const response = await fetchJsonWithHeaders(`${cmc.baseUrl}/v2/cryptocurrency/quotes/latest?${params}`, cmc.headers);
    for (const value of Object.values(response.data || {})) {
      const row = Array.isArray(value) ? value[0] : value;
      if (row?.id) quoteById.set(row.id, row);
    }
    await wait(CMC_REQUEST_DELAY_MS);
  }
  return quoteById;
}

function buildCmcVerification(row, tag) {
  const tags = row.cmcTags || [];
  const matched = tags.find((entry) => entry.slug === tag.slug);
  return {
    invested: Boolean(matched),
    source: "CoinMarketCap portfolio tag",
    sourceUrl: tag.url,
    matchType: matched ? "cmc_tag" : "not_listed",
    matchedName: matched?.name || "",
    matchedId: matched?.slug || "",
    review: false,
  };
}

function buildCmcRow(asset, pairs, futuresByAsset, quoteRow, existingIdentity, mappingSource) {
  const usd = quoteRow?.quote?.USD;
  const cmcId = quoteRow?.id || null;
  const cmcSlug = quoteRow?.slug || null;
  return {
    asset,
    name: quoteRow?.name || existingIdentity?.name || asset,
    fdv: usd?.fully_diluted_market_cap ?? existingIdentity?.fdv ?? null,
    marketCap: usd?.market_cap ?? existingIdentity?.marketCap ?? null,
    rank: quoteRow?.cmc_rank ?? existingIdentity?.rank ?? null,
    price: usd?.price ?? existingIdentity?.price ?? null,
    change24h: usd?.percent_change_24h ?? existingIdentity?.change24h ?? null,
    cmcId,
    cmcSlug,
    cmcUrl: cmcSlug ? `${CMC_CURRENCY_BASE_URL}/${cmcSlug}/` : null,
    cmcTags: quoteRow?.tags || [],
    coinGeckoId: existingIdentity?.coinGeckoId || null,
    mappingSource,
    spotPairs: [...pairs].sort(),
    hasBinanceFutures: futuresByAsset.has(asset),
    futuresPairs: [...(futuresByAsset.get(asset) || [])].sort(),
    dataStatus: usd?.fully_diluted_market_cap ? "ok" : (quoteRow ? "no_fdv" : "unmatched"),
  };
}

async function buildCmcDatasets({
  generatedAt,
  allSpot,
  quotedSpot,
  futuresByAsset,
  futuresSource,
  futuresNote,
  existingMainData,
  existingSpotData,
}) {
  const cmc = await resolveCmcConfig();
  if (!cmc) {
    return {
      skipped: true,
      reason: "CMC_API_KEY is not configured",
    };
  }

  const cmcEntries = await fetchCmcMap(cmc);
  const cmcIndexes = buildCmcIndexes(cmcEntries);
  const overrides = fs.existsSync("cmc-id-overrides.json")
    ? JSON.parse(fs.readFileSync("cmc-id-overrides.json", "utf8"))
    : {};
  const previousMap = fs.existsSync("cmc-binance-map.json")
    ? JSON.parse(fs.readFileSync("cmc-binance-map.json", "utf8"))
    : {};
  const existingByAsset = new Map(
    [...existingMainData.rows, ...existingSpotData.rows].map((row) => [row.asset, row]),
  );

  const resolvedEntries = {};
  for (const asset of new Set([...allSpot.keys(), ...quotedSpot.keys()])) {
    const resolved = resolveCmcEntry(asset, existingByAsset.get(asset), cmcIndexes, overrides, previousMap);
    if (resolved) {
      resolvedEntries[asset] = {
        id: resolved.id,
        slug: resolved.slug,
        name: resolved.name,
        symbol: resolved.symbol,
      };
    }
  }
  fs.writeFileSync("cmc-binance-map.json", `${JSON.stringify(sortedObject(resolvedEntries), null, 2)}\n`);

  const quotesById = await fetchCmcQuotesById(
    Object.values(resolvedEntries).map((entry) => ({ id: entry.id })),
    cmc,
  );

  const spotRows = [...allSpot.entries()].map(([asset, rawPairs]) => {
    const mapEntry = resolvedEntries[asset];
    const quoteRow = mapEntry ? quotesById.get(mapEntry.id) : null;
    return buildCmcRow(
      asset,
      [...rawPairs],
      futuresByAsset,
      quoteRow,
      existingByAsset.get(asset),
      mapEntry ? "cmc_verified_map" : "unmatched",
    );
  });

  spotRows.sort((a, b) => (b.fdv || 0) - (a.fdv || 0) || a.asset.localeCompare(b.asset));

  const mainRows = [...quotedSpot.keys()]
    .filter((asset) => futuresByAsset.has(asset))
    .map((asset) => {
      const mapEntry = resolvedEntries[asset];
      const quoteRow = mapEntry ? quotesById.get(mapEntry.id) : null;
      const row = buildCmcRow(
        asset,
        [...quotedSpot.get(asset)],
        futuresByAsset,
        quoteRow,
        existingByAsset.get(asset),
        mapEntry ? "cmc_verified_map" : "unmatched",
      );
      const yzi = buildCmcVerification(row, yziTag);
      const okx = buildCmcVerification(row, okxTag);
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

  fs.writeFileSync("spot-assets-data-cmc.json", `${JSON.stringify({
    generatedAt,
    criteria: "All distinct base assets with at least one currently trading Binance spot pair.",
    counts: {
      spotAssets: spotRows.length,
      withFdv: spotRows.filter((row) => row.fdv).length,
      withoutFdv: spotRows.filter((row) => !row.fdv).length,
      withBinanceFutures: spotRows.filter((row) => row.hasBinanceFutures).length,
    },
    sources: [
      "https://pro-api.coinmarketcap.com/v1/key/info",
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/map",
      "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest",
      futuresSource,
    ],
    notes: [
      "Rows are sorted by FDV descending; assets without FDV appear last.",
      "CMC links are generated from a verified Binance asset to CMC id/slug mapping.",
      "Binance multiplier assets such as 1000SATS and 1MBABYDOGE are mapped to their closest underlying CMC listings.",
      futuresNote,
      "FDV is point-in-time market data and changes with price and supply.",
    ],
    rows: spotRows,
  }, null, 2)}\n`);

  fs.writeFileSync("assets-data-cmc.json", `${JSON.stringify({
    generatedAt,
    criteria: "Assets with Binance spot trading enabled and Binance USD-M perpetual futures trading enabled.",
    counts: {
      spotAssets: quotedSpot.size,
      futuresAssets: futuresByAsset.size,
      matchedAssets: mainRows.length,
      withFdv: mainRows.filter((row) => row.fdv).length,
      yziLabs: mainRows.filter((row) => row.yziLabs).length,
      okxVentures: mainRows.filter((row) => row.okxVentures).length,
      needsInvestmentReview: 0,
    },
    sources: [
      "https://pro-api.coinmarketcap.com/v1/key/info",
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/map",
      "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest",
      futuresSource,
      yziTag.url,
      okxTag.url,
    ],
    notes: [
      "Investment tags are verified against CoinMarketCap portfolio tags on each asset.",
      "CMC links are generated from a verified Binance asset to CMC id/slug mapping.",
      "Binance multiplier assets such as 1000SATS and 1MBABYDOGE are mapped to their closest underlying CMC listings.",
    ],
    rows: mainRows,
  }, null, 2)}\n`);

  return {
    skipped: false,
    matchedAssets: mainRows.length,
    withFdv: mainRows.filter((row) => row.fdv).length,
    yziLabs: mainRows.filter((row) => row.yziLabs).length,
    okxVentures: mainRows.filter((row) => row.okxVentures).length,
    spotAssets: spotRows.length,
  };
}

module.exports = {
  buildCmcDatasets,
  resolveCmcConfig,
};
