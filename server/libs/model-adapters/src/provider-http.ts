import { BadGatewayException } from '@nestjs/common';

export async function fetchProviderJson<T>(
  url: string,
  init: RequestInit,
  providerName: string,
): Promise<T> {
  const response = await fetchProvider(url, init, providerName);

  if (!response.ok) {
    const message = await readProviderErrorMessage(response);

    throw new BadGatewayException(
      `${providerName} provider request failed: ${
        message || response.statusText
      }`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new BadGatewayException(
      `${providerName} provider returned invalid JSON`,
    );
  }
}

async function fetchProvider(
  url: string,
  init: RequestInit,
  providerName: string,
) {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new BadGatewayException(
      `${providerName} provider request failed: ${getErrorMessage(error)}`,
    );
  }
}

async function readProviderErrorMessage(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'network error';
}
