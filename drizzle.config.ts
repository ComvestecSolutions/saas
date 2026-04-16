import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

const envFilePaths = [".env.local", ".env"] as const;

const readEnvironmentValue = (key: string) => {
  const directValue = process.env[key];

  if (typeof directValue === "string" && directValue.length > 0) {
    return directValue;
  }

  for (const envFilePath of envFilePaths) {
    const absolutePath = resolve(process.cwd(), envFilePath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    const fileContents = readFileSync(absolutePath, "utf8");
    const matchedLine = fileContents
      .split(/\r?\n/u)
      .find((line) => line.startsWith(`${key}=`));

    if (matchedLine === undefined) {
      continue;
    }

    const value = matchedLine.slice(key.length + 1).trim();

    if (value.length > 0) {
      return value;
    }
  }

  throw new Error(
    `${key} is required for Drizzle commands. Define it in the shell or in .env.`,
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
