module.exports = {
  'server/**/*.{ts,js,json}': () => 'pnpm --filter @zeta/server lint',
  'apps/web/**/*.{ts,js,vue,json,css}': () => 'pnpm --filter @zeta/web lint',
};
