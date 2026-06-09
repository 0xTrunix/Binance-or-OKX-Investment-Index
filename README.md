# Binance Spot + Futures Crypto Screener

一个可直接部署到 Vercel 的静态前端列表，用于展示同时上线 Binance 现货与 Binance USD-M 永续合约的币种，并补充 FDV、YZi Labs / OKX Ventures 投资标签和 CoinMarketCap 直达链接。

## 内容

- `index.html`：页面入口
- `styles.css`：白色简约响应式 UI
- `app.js`：筛选、排序、渲染逻辑
- `assets-data.json`：当前前端使用的数据
- `cmc-slugs.json`：CMC 直达链接 slug 覆盖表
- `scripts/`：数据清洗脚本备份

## 本地预览

```bash
npm run dev
```

打开：

```text
http://localhost:8080
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

CMC 链接均为 `/currencies/<slug>/` 直达页格式，没有使用搜索页兜底。
