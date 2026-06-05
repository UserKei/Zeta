export const devPorts = {
  api: 3000,
  web: 4000,
  docs: 4010,
} as const;

export const devUrls = {
  apiBaseUrl: `http://localhost:${devPorts.api}`,
  webBaseUrl: `http://localhost:${devPorts.web}`,
  docsBaseUrl: `http://localhost:${devPorts.docs}`,
} as const;
