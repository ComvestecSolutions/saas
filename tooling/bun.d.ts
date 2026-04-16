declare const Bun: {
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
};
