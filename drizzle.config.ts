import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env.local on its own. On Vercel the vars are already set.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Direct (unpooled) connection: migrations shouldn't go through the pooler.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
