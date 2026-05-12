import { defineConfig } from "drizzle-kit";

const readEnvironmentValue = (key: string) => {
  const directValue = process.env[key]?.trim();

  if (directValue !== undefined && directValue.length > 0) {
    return directValue;
  }

  throw new Error(
    `${key} is required for Drizzle commands. Use a Vault-backed local wrapper such as \`bun run db:generate:local\` or \`bun run db:migrate:local\`, or set it in the current shell.`,
  );
};

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/modules/src/persistence/postgres/schema.ts",
  out: "./packages/modules/drizzle",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: readEnvironmentValue("POSTGRES_URL"),
  },
});
