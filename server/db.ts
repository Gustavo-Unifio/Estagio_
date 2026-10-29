import { PrismaClient } from "@prisma/client";

// Compartilha uma única instância Prisma entre os módulos da API.
export const prisma = new PrismaClient();
