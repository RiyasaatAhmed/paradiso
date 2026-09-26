import fs from 'node:fs';
import os from 'node:os';

export interface NetworkAddress {
  name: string;
  address: string;
}

/** Every IPv4 address a TV on the same router could reach this laptop on. */
export function lanAddresses(): NetworkAddress[] {
  const found: NetworkAddress[] = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        found.push({ name, address: address.address });
      }
    }
  }
  return found;
}

/**
 * True when running inside a container, where the addresses above belong to the
 * container's own network and are not routable from a TV. Worth knowing only so
 * the startup banner can say so instead of printing a URL that cannot work.
 */
export function inContainer(): boolean {
  return fs.existsSync('/.dockerenv');
}
