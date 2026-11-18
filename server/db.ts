import { PrismaClient } from "@prisma/client";

// Compartilha uma única instância Prisma em ambientes locais e serverless.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
