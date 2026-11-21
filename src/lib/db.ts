import { Pool } from "pg";

const globalForDb = globalThis as unknown as { saasAppPool?: Pool };

export const db =
    globalForDb.saasAppPool ??
    new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
    });

if (process.env.NODE_ENV !== "production") globalForDb.saasAppPool = db;
