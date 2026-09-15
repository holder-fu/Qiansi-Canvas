const MAX_ACTIVE_VIDEO_DECODERS = 2;

type Lease = { id: string; onEvicted: () => void };
const leases: Lease[] = [];

export function acquireVideoDecoder(id: string, onEvicted: () => void) {
  const existing = leases.find((lease) => lease.id === id);
  if (existing) {
    existing.onEvicted = onEvicted;
    return true;
  }
  leases.push({ id, onEvicted });
  while (leases.length > MAX_ACTIVE_VIDEO_DECODERS) {
    const evicted = leases.shift();
    evicted?.onEvicted();
  }
  return leases.some((lease) => lease.id === id);
}

export function releaseVideoDecoder(id: string) {
  const index = leases.findIndex((lease) => lease.id === id);
  if (index >= 0) leases.splice(index, 1);
}

export function activeVideoDecoderCount() {
  return leases.length;
}
