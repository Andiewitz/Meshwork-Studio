// Persistence-adapter detail. Never import this from a public/wire contract.
import type { PgTransaction } from "drizzle-orm/pg-core";

export type DrizzleTx = PgTransaction<any, any, any>;
