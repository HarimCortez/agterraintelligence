import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma's config-file mode (as opposed to the legacy package.json#prisma
// key) does not auto-load .env the way the CLI used to — load it explicitly
// so `prisma generate`/`migrate`/`studio` pick up DATABASE_URL from
// packages/db/.env for local dev, same as before.
loadEnv({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    // `prisma.config.ts` takes precedence over the deprecated
    // `package.json#prisma.seed` key, so the seed command must be declared
    // here for `prisma db seed` / `prisma migrate dev` to pick it up.
    seed: "tsx prisma/seed.ts",
  },
});
