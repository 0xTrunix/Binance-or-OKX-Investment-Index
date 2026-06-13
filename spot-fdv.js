const spotState = {
  data: null,
  search: "",
  minFdv: null,
  maxFdv: null,
  futuresOnly: false,
  visibleLimit: 100,
};

const amountMultipliers = {
  K: 1e3,
  M: 1e6,
  B: 1e9,
  T: 1e12,
};

const escapeSpotHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function formatSpotUsd(value) {
  if (!value) return '<span class="missing">缺失</span>';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toLocaleString()}`;
}

function formatRangeValue(value) {
  if (value === null) return "不限";
  return formatSpotUsd(value).replace(/<[^>]+>/g, "");
}

function parseFdvInput(rawValue) {
  const value = rawValue.trim().toUpperCase().replaceAll(",", "").replaceAll("$", "").replaceAll(" ", "");
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?)([KMBT])?$/);
  if (!match) throw new Error("请输入 5B、500M 或完整数字等有效金额");
  const amount = Number(match[1]) * (amountMultipliers[match[2]] || 1);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("FDV 必须是有效的正数");
  return amount;
}

function spotMetric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderSpotMetrics(rows) {
  document.getElementById("spotMetrics").innerHTML = [
    spotMetric("Binance 现货币种", spotState.data.counts.spotAssets),
    spotMetric("有 FDV 数据", spotState.data.counts.withFdv),
    spotMetric("当前区间结果", rows.length),
  ].join("");
}

function getSpotRows() {
  const term = spotState.search.trim().toUpperCase();
  return spotState.data.rows
    .filter((row) => {
      if (term && !row.asset.includes(term) && !row.name.toUpperCase().includes(term)) return false;
      if (spotState.minFdv !== null && (!row.fdv || row.fdv < spotState.minFdv)) return false;
      if (spotState.maxFdv !== null && (!row.fdv || row.fdv > spotState.maxFdv)) return false;
      if (spotState.futuresOnly && !row.hasBinanceFutures) return false;
      return true;
    })
    .sort((a, b) => (b.fdv || 0) - (a.fdv || 0) || a.asset.localeCompare(b.asset));
}

function renderSpotPairs(pairs) {
  return `<div class="pair-list">${pairs.slice(0, 6).map((pair) => `<span class="pair">${escapeSpotHtml(pair)}</span>`).join("")}${
    pairs.length > 6 ? `<span class="pair">+${pairs.length - 6}</span>` : ""
  }</div>`;
}

function renderSpotRows() {
  const rows = getSpotRows();
  const visibleRows = rows.slice(0, spotState.visibleLimit);
  renderSpotMetrics(rows);
  document.getElementById("spotResultCount").textContent =
    `匹配 ${rows.length} 个币种，当前展示 ${visibleRows.length} 个`;
  document.getElementById("activeRange").textContent =
    `FDV：${formatRangeValue(spotState.minFdv)} 至 ${formatRangeValue(spotState.maxFdv)} · 合约：${
      spotState.futuresOnly ? "仅已上线" : "全部现货"
    }`;
  document.getElementById("spotAssetRows").innerHTML = visibleRows.length
    ? visibleRows.map((row) => `<tr>
        <td data-label="币种">
          <div class="coin">
            <div class="avatar">${escapeSpotHtml(row.asset.slice(0, 4))}</div>
            <div>
              <strong>${escapeSpotHtml(row.asset)}</strong>
              <small>${escapeSpotHtml(row.name)}${row.rank ? ` · Rank #${row.rank}` : ""}</small>
            </div>
          </div>
        </td>
        <td data-label="FDV"><div class="fdv">${formatSpotUsd(row.fdv)}</div></td>
        <td data-label="市值"><div class="fdv market-cap-value">${formatSpotUsd(row.marketCap)}</div></td>
        <td data-label="Binance 现货">${renderSpotPairs(row.spotPairs)}</td>
        <td data-label="Binance 合约">${
          row.hasBinanceFutures
            ? renderSpotPairs(row.futuresPairs)
            : '<span class="badge no">No</span>'
        }</td>
        <td data-label="CoinGecko">${
          row.coinGeckoUrl
            ? `<a class="coin-link" href="${row.coinGeckoUrl}" target="_blank" rel="noreferrer">CoinGecko</a>`
            : '<span class="muted">-</span>'
        }</td>
      </tr>`).join("")
    : '<tr class="empty-row"><td colspan="6">当前区间没有匹配币种</td></tr>';
  const loadMoreButton = document.getElementById("loadMoreButton");
  loadMoreButton.hidden = visibleRows.length >= rows.length;
  loadMoreButton.textContent = `显示更多（剩余 ${rows.length - visibleRows.length}）`;
}

function applyRange() {
  const error = document.getElementById("rangeError");
  try {
    const minFdv = parseFdvInput(document.getElementById("minFdvInput").value);
    const maxFdv = parseFdvInput(document.getElementById("maxFdvInput").value);
    if (minFdv !== null && maxFdv !== null && minFdv > maxFdv) {
      throw new Error("FDV 下限不能高于上限");
    }
    spotState.minFdv = minFdv;
    spotState.maxFdv = maxFdv;
    spotState.visibleLimit = 100;
    error.textContent = "";
    renderSpotRows();
  } catch (rangeError) {
    error.textContent = rangeError.message;
  }
}

function bindSpotControls() {
  document.getElementById("spotSearchInput").addEventListener("input", (event) => {
    spotState.search = event.target.value;
    spotState.visibleLimit = 100;
    renderSpotRows();
  });
  document.getElementById("futuresOnlyInput").addEventListener("change", (event) => {
    spotState.futuresOnly = event.target.checked;
    spotState.visibleLimit = 100;
    renderSpotRows();
  });
  document.getElementById("rangeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    applyRange();
  });
  document.getElementById("clearRangeButton").addEventListener("click", () => {
    document.getElementById("minFdvInput").value = "";
    document.getElementById("maxFdvInput").value = "";
    document.getElementById("futuresOnlyInput").checked = false;
    document.getElementById("rangeError").textContent = "";
    spotState.minFdv = null;
    spotState.maxFdv = null;
    spotState.futuresOnly = false;
    spotState.visibleLimit = 100;
    renderSpotRows();
  });
  document.getElementById("loadMoreButton").addEventListener("click", () => {
    spotState.visibleLimit += 100;
    renderSpotRows();
  });
}

async function initSpotPage() {
  const response = await fetch("spot-assets-data.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  spotState.data = await response.json();
  const time = new Date(spotState.data.generatedAt).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
  document.getElementById("spotSourceLine").textContent =
    `范围：所有当前可交易的 Binance 现货基础资产。FDV 数据来自 CoinGecko，生成时间：${time}`;
  bindSpotControls();
  renderSpotRows();
}

initSpotPage().catch((error) => {
  document.body.innerHTML =
    `<main class="shell"><h1>数据加载失败</h1><p>${escapeSpotHtml(error.message)}</p></main>`;
});
