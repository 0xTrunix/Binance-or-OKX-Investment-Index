const fs = require("fs");

const data = JSON.parse(fs.readFileSync("assets-data.json", "utf8"));

const manual = {
  "1000CAT": ["cat"],
  "1000CHEEMS": ["cheems-token", "cheems"],
  AAVE: ["aave"],
  AGLD: ["adventure-gold"],
  AIGENSYN: ["aigensyn"],
  AIXBT: ["aixbt"],
  ALICE: ["myneighboralice"],
  ALLO: ["allo"],
  ALPINE: ["alpine-f1-team-fan-token"],
  ANIME: ["animecoin"],
  ASTER: ["aster"],
  AUCTION: ["bounce-token"],
  AVNT: ["avantis"],
  AWE: ["awe-network"],
  BANANAS31: ["bananas-for-scale"],
  BERA: ["berachain"],
  BOME: ["book-of-meme"],
  BROCCOLI714: ["broccoli-714"],
  C98: ["coin98"],
  CATI: ["catizen"],
  CETUS: ["cetus-protocol"],
  CGPT: ["chaingpt"],
  COOKIE: ["cookie-dao"],
  CVX: ["convex-finance"],
  D: ["dar-open-network"],
  DOLO: ["dolomite"],
  DOGS: ["dogs"],
  DYM: ["dymension"],
  DYDX: ["dydx"],
  EIGEN: ["eigenlayer"],
  ENS: ["ethereum-name-service"],
  ETHFI: ["ether-fi-ethfi"],
  EUL: ["euler"],
  GTC: ["gitcoin"],
  HFT: ["hashflow"],
  HIGH: ["highstreet"],
  HUMA: ["huma-finance"],
  ILV: ["illuvium"],
  JASMY: ["jasmy"],
  JOE: ["joe"],
  JTO: ["jito"],
  KAITO: ["kaito"],
  LINEA: ["linea"],
  MAGIC: ["magic-token"],
  MBOX: ["mobox"],
  MINA: ["mina"],
  MITO: ["mitosis"],
  MORPHO: ["morpho"],
  MOVR: ["moonriver"],
  NEIRO: ["neiro-ethereum"],
  NFP: ["nfprompt"],
  NOT: ["notcoin"],
  ONDO: ["ondo-finance"],
  OP: ["optimism-ethereum"],
  ORDI: ["ordi"],
  PEOPLE: ["constitutiondao"],
  PENDLE: ["pendle"],
  PENGU: ["pudgy-penguins"],
  PIXEL: ["pixels"],
  PNUT: ["peanut-the-squirrel"],
  POLYX: ["polymesh"],
  PUNDIX: ["pundix-new"],
  PYTH: ["pyth-network"],
  RENDER: ["render"],
  RESOLV: ["resolv"],
  SAGA: ["saga"],
  SEI: ["sei"],
  SOLV: ["solv-protocol"],
  SPELL: ["spell-token"],
  SSV: ["ssv-network"],
  STG: ["stargate-finance"],
  STRK: ["starknet-token"],
  SYRUP: ["syrup"],
  TAO: ["bittensor"],
  TIA: ["celestia"],
  TLM: ["alien-worlds"],
  TNSR: ["tensor"],
  TOWNS: ["towns"],
  TURBO: ["turbo"],
  TURTLE: ["turtle"],
  USUAL: ["usual"],
  USTC: ["terrausd"],
  VANA: ["vana"],
  VANRY: ["vanar-chain"],
  VELODROME: ["velodrome-finance"],
  VIRTUAL: ["virtual-protocol"],
  WIF: ["dogwifhat"],
  WLD: ["worldcoin", "worldcoin-org"],
  WLFI: ["world-liberty-financial"],
  XAI: ["xai"],
  ZAMA: ["zama"],
};

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const candidates = [];
for (const row of data.rows) {
  if (!row.cmcUrl.includes("/search/")) continue;
  const seen = new Set();
  const values = [
    ...(manual[row.asset] || []),
    row.coinGeckoId,
    slugify(row.name),
    slugify(row.asset),
  ].filter(Boolean);
  for (const slug of values) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    candidates.push({ asset: row.asset, slug, url: `https://coinmarketcap.com/currencies/${slug}/` });
  }
}

fs.writeFileSync(
  "cmc-candidates.tsv",
  candidates.map((item) => `${item.asset}\t${item.slug}\t${item.url}`).join("\n") + "\n",
);
console.log({ assets: new Set(candidates.map((item) => item.asset)).size, candidates: candidates.length });
