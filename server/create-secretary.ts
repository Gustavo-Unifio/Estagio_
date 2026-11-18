import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "./db.js";

// Lê uma variável obrigatória e rejeita valores ausentes.
function requiredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Configure ${name} no ambiente antes de criar a conta.`);
  }
  return value;
}

// Valida as credenciais e cria uma conta vinculada a uma unidade.
async function main() {
  const email = requiredValue("SECRETARY_EMAIL").toLowerCase();
  const password = requiredValue("SECRETARY_PASSWORD");
  const name = requiredValue("SECRETARY_NAME");
  const seat = requiredValue("SECRETARY_SEAT");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("SECRETARY_EMAIL não contém um endereço de e-mail válido.");
  }
  if (password.length < 12 || password.length > 200) {
    throw new Error("SECRETARY_PASSWORD deve ter entre 12 e 200 caracteres.");
  }
  if (name.length > 120 || seat.length > 160) {
    throw new Error("Nome ou unidade excede o tamanho permitido.");
  }
  if (await prisma.usuario.findUnique({ where: { email } })) {
    throw new Error("Já existe uma conta com este e-mail. A senha não foi alterada.");
  }

  await prisma.usuario.create({
    data: {
      email,
      nome: name,
      senhaHash: await hash(password, 12),
      perfil: "SECRETARIA",
      permissaoSede: { create: { sedeNome: seat } },
    },
  });

  console.info(`Conta de secretaria criada para ${email}, vinculada a ${seat}.`);
}

// Sempre encerra a conexão e retorna código de erro em caso de falha.
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Não foi possível criar a conta de secretaria.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
