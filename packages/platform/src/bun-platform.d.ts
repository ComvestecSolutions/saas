/**
 * Minimal Bun runtime ambient type declarations for the platform package.
 * Covers the subset of Bun globals used in packages/platform/src/.
 */

interface BunCryptoHasher {
  update(data: string | ArrayBufferView): BunCryptoHasher;
  digest(encoding: "base64url" | "hex" | "base64"): string;
}

declare const Bun: {
  /**
   * Resolves a module specifier to an absolute path using Bun's module
   * resolution algorithm, starting from `from` (an absolute directory path).
   */
  resolveSync(specifier: string, from: string): string;
  /** Bun's native HMAC/hash helper. Pass a key to enable HMAC mode. */
  readonly CryptoHasher: new (
    algorithm: string,
    key?: string | ArrayBufferView,
  ) => BunCryptoHasher;
  /** Read a file lazily; call .text() / .arrayBuffer() etc. for content. */
  file(path: string): { text(): Promise<string> };
};

interface ImportMeta {
  /** The directory of the current module file. Bun runtime extension. */
  readonly dir: string;
}
