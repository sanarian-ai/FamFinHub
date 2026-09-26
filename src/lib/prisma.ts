import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton to avoid exhausting connections on hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaShutdownHooked?: boolean;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Release pooled DB connections cleanly on process shutdown (SIGTERM/SIGINT).
// Without this, a Render spin-down (or any restart) leaves this process's
// connections held open in Supabase's session-mode pooler until Supavisor
// notices the dead socket on its own timeline. Since the pooler's session
// slots are a small, fixed budget, connections stranded this way can pile up
// across successive restarts and starve a later request of any free slot
// (the EMAXCONNSESSION "max clients reached" failure). Guarded against
// double-registration if this module is evaluated more than once.
if (!globalForPrisma.prismaShutdownHooked) {
  globalForPrisma.prismaShutdownHooked = true;
  const shutdown = (signal: string) => {
    prisma
      .$disconnect()
      .catch(() => {
        // best-effort — the process is exiting regardless
      })
      .finally(() => {
        process.exit(0);
      });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
