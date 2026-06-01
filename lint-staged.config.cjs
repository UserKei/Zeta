const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;

const formatWith = (workspace) => (files) =>
  `pnpm --filter ${workspace} exec prettier --write --ignore-unknown ${files.map(quote).join(" ")}`;

module.exports = {
  "server/**/*.{ts,js,json}": [
    formatWith("@zeta/server"),
    () => "pnpm --filter @zeta/server lint",
  ],
  "apps/web/**/*.{ts,js,vue,json,css}": [
    formatWith("@zeta/web"),
    () => "pnpm --filter @zeta/web lint",
  ],
  "packages/**/*.{ts,js,json}": [formatWith("@zeta/web")],
  "docs/**/*.{md,json,yml,yaml}": [formatWith("@zeta/web")],
  "*.{js,cjs,mjs,json,md,yml,yaml}": [formatWith("@zeta/web")],
};
