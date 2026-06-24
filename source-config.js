const SOURCE_CONFIG = {
  coingecko: {
    id: "coingecko",
    label: "CoinGecko",
    shortLabel: "CG",
    mainDataPath: "assets-data.json",
    spotDataPath: "spot-assets-data.json",
    marketUrlField: "coinGeckoUrl",
    marketLinkLabel: "CoinGecko",
    investorLinkLabel: "CoinGecko",
    mainEyebrow: "Crypto Research Screener",
    spotEyebrow: "Binance Spot FDV Screener",
    mainTitle: "Binance 现货 + 合约币种池",
    spotTitle: "Binance 全现货 FDV 筛选",
    sourceSummary:
      "筛选条件：已上 Binance 现货且已上 Binance USD-M 永续合约。投资标签按 CoinGecko portfolio category 会员关系验证，优先使用 CoinGecko ID 匹配。",
    spotSummary: "范围：所有当前可交易的 Binance 现货基础资产。FDV 数据来自 CoinGecko。",
  },
  cmc: {
    id: "cmc",
    label: "CoinMarketCap",
    shortLabel: "CMC",
    mainDataPath: "assets-data-cmc.json",
    spotDataPath: "spot-assets-data-cmc.json",
    marketUrlField: "cmcUrl",
    marketLinkLabel: "CMC",
    investorLinkLabel: "CMC",
    mainEyebrow: "Crypto Research Screener",
    spotEyebrow: "Binance Spot FDV Screener",
    mainTitle: "Binance 现货 + 合约币种池",
    spotTitle: "Binance 全现货 FDV 筛选",
    sourceSummary:
      "筛选条件：已上 Binance 现货且已上 Binance USD-M 永续合约。投资标签按 CoinMarketCap portfolio tag 验证，优先使用已核验的 Binance 资产映射。",
    spotSummary: "范围：所有当前可交易的 Binance 现货基础资产。FDV 数据来自 CoinMarketCap。",
  },
};

function getSourceConfig() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source");
  return SOURCE_CONFIG[source] || SOURCE_CONFIG.coingecko;
}

function sourceHref(path, sourceId) {
  return `${path}?source=${encodeURIComponent(sourceId)}`;
}
