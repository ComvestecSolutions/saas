interface BunCryptoHasher {
  update(data: string | ArrayBufferView): BunCryptoHasher;
  digest(encoding: "base64url" | "hex" | "base64"): string;
}

declare const Bun: {
  resolveSync(specifier: string, from: string): string;
  env: Record<string, string | undefined>;
  argv: readonly string[];
  file(path: string): { text(): Promise<string> };
  readonly CryptoHasher: new (
    algorithm: string,
    key?: string | ArrayBufferView,
  ) => BunCryptoHasher;
  serve(options: {
    readonly port: number;
    readonly fetch: (request: Request) => Response | Promise<Response>;
  }): {
    readonly port: number;
  };
  spawn(
    command: ReadonlyArray<string>,
    options?: {
      readonly cwd?: string;
      readonly env?: NodeJS.ProcessEnv;
      readonly stdin?: "ignore" | "inherit" | "pipe";
      readonly stdout?: "ignore" | "inherit" | "pipe";
      readonly stderr?: "ignore" | "inherit" | "pipe";
    },
  ): {
    readonly exited: Promise<number>;
  };
  spawnSync(
    command: ReadonlyArray<string>,
    options?: {
      readonly cwd?: string;
      readonly env?: NodeJS.ProcessEnv;
      readonly stdin?: "ignore" | "inherit" | "pipe";
      readonly stdout?: "pipe";
      readonly stderr?: "pipe";
    },
  ): {
    readonly stdout: Uint8Array;
    readonly stderr: Uint8Array;
    readonly exitCode: number;
  };
};

interface ImportMeta {
  /** The directory of the current module file. Bun runtime extension. */
  readonly dir: string;
}
