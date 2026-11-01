/** Content primitives share the orbital skin; adding an element never changes channel chrome. */
export const TECH_REEL_ELEMENT_KINDS = ['server', 'database', 'service', 'sphere', 'ring', 'storage', 'compute', 'queue'] as const;
export const TECH_REEL_ELEMENTS = [
  { kind: 'server', use: 'Compact application/server in a network diagram.' },
  { kind: 'database', use: 'Persistent store, reads, writes and bottlenecks.' },
  { kind: 'service', use: 'Shared service such as a cache, coalescer or gateway.' },
  { kind: 'sphere', use: 'Audience or clients. labelPlacement: above keeps outbound traffic clear of the label.' },
  { kind: 'ring', use: 'Partitions or distributed storage.' },
  { kind: 'storage', use: 'Storage occupancy driven by load.' },
  { kind: 'compute', use: 'CPU cores and RAM modules physically appear as cores/memoryGb increase. load drives CPU activity; memoryUsed (0–1) fills RAM; status online/offline switches power. Set coreSlots/memorySlots once to fix the visible grid across the whole reel.' },
  { kind: 'queue', use: 'Visible waiting requests. queueDepth (0–24) grows or drains tokens; label is left of the queue.' },
] as const;
