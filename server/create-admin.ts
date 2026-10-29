import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "./db";

// Valida as credenciais do ambiente e cria a conta administrativa inicial.
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Configure ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env antes de criar a conta administrativa.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL não contém um endereço de e-mail válido.");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");
  }

  const existingUser = await prisma.usuario.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(
      "Já existe uma conta com este e-mail. A senha não foi alterada.",
    );
  }

  await prisma.usuario.create({
    data: {
      email,
      nome: "Administrador",
      senhaHash: await hash(password, 12),
      perfil: "ADMIN",
    },
  });

  console.info(`Conta administrativa criada para ${email}.`);
}

// Sempre encerra a conexão e retorna código de erro em caso de falha.
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Não foi possível criar a conta administrativa.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
