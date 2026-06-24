# Binance Spot + Futures Crypto Screener

一个可直接部署到 Vercel 的静态前端筛选工具，包含：

- 数据源入口页，可选择 CoinGecko / CoinMarketCap 看板
- 同时上线 Binance 现货与 Binance USD-M 永续合约的币种列表
- Binance 全现货币种 FDV 区间筛选页面
- 可叠加筛选是否已上线 Binance 合约
- YZi Labs / OKX Ventures 投资标签和 CoinGecko / CMC 直达链接

## 内容

- `index.html`：数据源选择入口
- `dashboard.html`：主看板页面
- `styles.css`：白色简约响应式 UI
- `app.js`：筛选、排序、渲染逻辑
- `assets-data.json`：当前前端使用的数据
- `assets-data-cmc.json`：CoinMarketCap 主看板数据
- `spot-fdv.html`：Binance 全现货 FDV 区间筛选页面
- `spot-fdv.js`：全现货搜索和 FDV 上下限筛选逻辑
- `spot-assets-data.json`：Binance 全现货 FDV 数据
- `spot-assets-data-cmc.json`：CoinMarketCap 全现货 FDV 数据
- `coingecko-binance-ids.json`：CoinGecko Binance 交易对精确 ID 映射
- `coingecko-id-overrides.json`：CoinGecko 交易对接口未覆盖资产的人工核验 ID
- `cmc-binance-map.json`：Binance 资产到 CMC id / slug 的核验映射
- `cmc-id-overrides.json`：CMC 冲突 symbol 的人工覆盖表
- `scripts/`：数据清洗脚本备份

## 本地预览

```bash
npm run dev
```

打开：

```text
http://localhost:8080
```

全现货 FDV 页面：

```text
http://localhost:8080/spot-fdv.html
```

## 在线预览
```text
https://binance-or-okx-investment-index-4pf.vercel.app/
```

也可以不用 npm，直接运行：

```bash
python3 -m http.server 8080
```

## Vercel 部署

1. 把本目录上传到 GitHub 仓库。
2. 在 Vercel 里选择该仓库。
3. Framework Preset 选择 `Other`。
4. Build Command 留空。
5. Output Directory 留空或填 `.`。
6. 部署即可。

## 数据说明

当前数据生成时间写在 `assets-data.json` 的 `generatedAt` 字段里。筛选标准是：

- Binance 现货可交易
- Binance USD-M 永续合约可交易
- 排除 Binance TradFi equity perpetual

币种链接与 FDV 使用同一个 CoinGecko ID，格式为 `/en/coins/<id>`，避免同 ticker 项目误跳转。

全现货数据可以通过以下命令刷新：

```bash
npm run update:data
```

仓库已配置 GitHub Actions，每两天自动运行一次同样的更新流程。工作流会刷新
`assets-data.json`、`spot-assets-data.json`、`assets-data-cmc.json`、
`spot-assets-data-cmc.json`、CoinGecko / CMC 映射缓存；如果数据有变化，
会自动提交到 `main` 分支。

如需提高稳定性，可以配置 GitHub Secret `COINGECKO_API_KEY`。脚本会优先使用
官方 API key 认证；未提供时则回退到公开接口。

CMC 看板依赖 GitHub Secret `CMC_API_KEY`。未提供时会保留上一版 CMC 数据文件。

投资标签采用更严格的验证口径：

- YZi Labs：CoinGecko `YZi Labs Portfolio` category
- OKX Ventures：CoinGecko `OKX Ventures Portfolio` category
- 优先按 CoinGecko ID 精确匹配
- ID 缺失时仅允许唯一 ticker fallback，并在数据中标记为需复核
