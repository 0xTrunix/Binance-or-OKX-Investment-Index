const fs = require("fs");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const mapping = readJson("coingecko-binance-ids.json");
const overrides = readJson("coingecko-id-overrides.json");
const datasets = ["assets-data.json", "spot-assets-data.json"];
const issues = [];

for (const file of datasets) {
  const data = readJson(file);
  if (data.sources?.some((source) => source.includes("coinmarketcap"))) {
    issues.push(`${file}: data sources still contain an obsolete external provider`);
  }
  for (const row of data.rows) {
    const mappedId = mapping[row.asset] || overrides[row.asset];
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

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified CoinGecko ID and URL consistency across ${datasets.join(" and ")}.`);
}
