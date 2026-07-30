// Named Argon2d cost profiles — the append-only registry of every KDF
// cost Superbacked has ever shipped. Artifacts never store parameters:
// they are discovered at restore by trying profiles against the artifact
// (see docs/technical-documentation/scheme-registry.md),
// so every row is
// frozen forever — changing one silently changes the key of every
// artifact created with it. Strengthening means appending a row, never
// editing one.
//
// Units match the argon2 binary: memory in KiB (-k), passes (-t),
// parallelism lanes (-p). Attack cost scales with memory × passes
// (memory-bandwidth-bound — see src/shared/utilities/zxcvbn.ts);
// parallelism only divides honest wall-clock, so it is free to raise.

export interface KdfProfile {
  readonly memoryKiB: number
  readonly passes: number
  readonly parallelism: number
}

// Every v1 block, blockset and standalone archive in the wild
export const legacyKdfProfile: KdfProfile = Object.freeze({
  memoryKiB: 65536,
  passes: 10,
  parallelism: 2,
})

// Creation default — 8× legacy attack cost at the same 64 MiB, so the
// restore hardware floor is unchanged
export const standardKdfProfile: KdfProfile = Object.freeze({
  memoryKiB: 65536,
  passes: 80,
  parallelism: 4,
})

// Opt-in (Settings and --paranoid, creation and restore) — 10× the
// standard attack cost, and 1 GiB of memory raises the minimum attack
// hardware 16-fold. The same gigabyte is a restore floor: restoring
// requires the mode enabled and ≥1 GiB of free memory
export const paranoidKdfProfile: KdfProfile = Object.freeze({
  memoryKiB: 1048576,
  passes: 50,
  parallelism: 4,
})
