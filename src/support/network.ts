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
