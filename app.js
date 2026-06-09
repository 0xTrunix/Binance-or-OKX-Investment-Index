const state = {
  data: null,
  filter: "all",
  search: "",
  sort: "fdv-desc",
  fdvOnly: false,
};

const formatUsd = (value) => {
  if (!value) return '<span class="missing">缺失</span>';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toLocaleString()}`;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderMetrics(data) {
  document.getElementById("metrics").innerHTML = [
    metric("符合条件币种", data.counts.matchedAssets),
    metric("有 FDV 数据", data.counts.withFdv),
    metric("YZi Labs 投资", data.counts.yziLabs),
    metric("OKX Ventures 投资", data.counts.okxVentures),
    metric("现货资产池", data.counts.spotAssets),
  ].join("");

  const time = new Date(data.generatedAt).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
  document.getElementById("sourceLine").textContent =
    `筛选条件：已上 Binance 现货且已上 Binance USD-M 永续合约。生成时间：${time}`;
}

function getFilteredRows() {
  const term = state.search.trim().toUpperCase();
  return state.data.rows
    .filter((row) => {
      if (state.fdvOnly && !row.fdv) return false;
      if (state.filter === "yzi" && !row.yziLabs) return false;
      if (state.filter === "okx" && !row.okxVentures) return false;
      if (state.filter === "both" && !(row.yziLabs && row.okxVentures)) return false;
      if (!term) return true;
      return row.asset.includes(term) || row.name.toUpperCase().includes(term);
    })
    .sort((a, b) => {
      if (state.sort === "fdv-asc") return (a.fdv || Number.MAX_SAFE_INTEGER) - (b.fdv || Number.MAX_SAFE_INTEGER);
      if (state.sort === "rank-asc") return (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER);
      if (state.sort === "ticker-asc") return a.asset.localeCompare(b.asset);
      return (b.fdv || 0) - (a.fdv || 0);
    });
}

function renderPairs(pairs) {
  return `<div class="pair-list">${pairs.slice(0, 5).map((pair) => `<span class="pair">${pair}</span>`).join("")}${
    pairs.length > 5 ? `<span class="pair">+${pairs.length - 5}</span>` : ""
  }</div>`;
}

function renderRows() {
  const rows = getFilteredRows();
  document.getElementById("resultCount").textContent = `当前显示 ${rows.length} / ${state.data.rows.length} 个币种`;
  document.getElementById("assetRows").innerHTML = rows
    .map(
      (row) => `<tr>
        <td data-label="币种">
          <div class="coin">
            <div class="avatar">${escapeHtml(row.asset.slice(0, 4))}</div>
            <div>
              <strong>${escapeHtml(row.asset)}</strong>
              <small>${escapeHtml(row.name)}${row.rank ? ` · Rank #${row.rank}` : ""}</small>
            </div>
          </div>
        </td>
        <td data-label="FDV">
          <div class="fdv">${formatUsd(row.fdv)}</div>
          <div class="muted">MCap ${formatUsd(row.marketCap)}</div>
        </td>
        <td data-label="Binance 现货">${renderPairs(row.spotPairs)}</td>
        <td data-label="Binance 合约">${renderPairs(row.futuresPairs)}</td>
        <td data-label="YZi Labs"><span class="badge ${row.yziLabs ? "yes yzi" : "no"}">${row.yziLabs ? "Yes" : "No"}</span></td>
        <td data-label="OKX Ventures"><span class="badge ${row.okxVentures ? "yes okx" : "no"}">${row.okxVentures ? "Yes" : "No"}</span></td>
        <td data-label="CMC"><a class="cmc" href="${row.cmcUrl}" target="_blank" rel="noreferrer">CMC</a></td>
      </tr>`,
    )
    .join("");
}

function bindControls() {
  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderRows();
  });

  document.getElementById("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderRows();
  });

  document.getElementById("fdvOnly").addEventListener("change", (event) => {
    state.fdvOnly = event.target.checked;
    renderRows();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderRows();
    });
  });
}

async function init() {
  const response = await fetch("assets-data.json");
  state.data = await response.json();
  renderMetrics(state.data);
  renderRows();
  bindControls();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="shell"><h1>数据加载失败</h1><p>${escapeHtml(error.message)}</p></main>`;
});
