const fs = require("fs");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const issues = [];

const coingeckoMapping = readJson("coingecko-binance-ids.json");
const coingeckoOverrides = readJson("coingecko-id-overrides.json");
const cmcMapping = fs.existsSync("cmc-binance-map.json") ? readJson("cmc-binance-map.json") : {};

for (const file of ["assets-data.json", "spot-assets-data.json"]) {
  const data = readJson(file);
  if (data.sources?.some((source) => source.includes("coinmarketcap"))) {
    issues.push(`${file}: data sources still contain an obsolete external provider`);
  }
  for (const row of data.rows) {
    const mappedId = coingeckoMapping[row.asset] || coingeckoOverrides[row.asset];
    if (row.coinGeckoId && !mappedId) {
      issues.push(`${file}: ${row.asset} has an ID that is not in a verified mapping file`);
    }
    if (mappedId && row.coinGeckoId !== mappedId) {
      issues.push(`${file}: ${row.asset} uses ${row.coinGeckoId || "no ID"}, expected ${mappedId}`);
    }

    const expectedUrl = row.coinGeckoId
      ? `https://www.coingecko.com/en/coins/${row.coinGeckoId}`
      : null;
    if ((row.coinGeckoUrl || null) !== expectedUrl) {
      issues.push(`${file}: ${row.asset} has an inconsistent CoinGecko URL`);
    }
    if ("cmcUrl" in row) {
      issues.push(`${file}: ${row.asset} still contains a legacy external URL`);
    }
  }
}

for (const file of ["assets-data-cmc.json", "spot-assets-data-cmc.json"]) {
  if (!fs.existsSync(file)) continue;
  const data = readJson(file);
  for (const row of data.rows) {
    const mapped = cmcMapping[row.asset];
    if (mapped) {
      if (row.cmcId !== mapped.id) issues.push(`${file}: ${row.asset} uses CMC id ${row.cmcId || "none"}, expected ${mapped.id}`);
      if (row.cmcSlug !== mapped.slug) issues.push(`${file}: ${row.asset} uses slug ${row.cmcSlug || "none"}, expected ${mapped.slug}`);
    }
    const expectedUrl = row.cmcSlug ? `https://coinmarketcap.com/currencies/${row.cmcSlug}/` : null;
    if ((row.cmcUrl || null) !== expectedUrl) {
      issues.push(`${file}: ${row.asset} has an inconsistent CMC URL`);
    }
  }
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Verified CoinGecko and CoinMarketCap dataset link consistency.");
}
