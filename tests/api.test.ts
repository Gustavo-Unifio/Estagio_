import { hash } from "bcryptjs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../server/app";
import { prisma } from "../server/db";

if (process.env.DATABASE_URL !== "file:./test.db") {
  throw new Error("Os testes de API exigem DATABASE_URL=file:./test.db.");
}

const password = "senha-de-teste-123";

async function createUser(
  perfil: "ADMIN" | "SECRETARIA",
  email: string,
  sede?: string,
) {
  return prisma.usuario.create({
    data: {
      email,
      nome: perfil === "ADMIN" ? "Administrador de teste" : "Secretaria de teste",
      senhaHash: await hash(password, 4),
      perfil,
      ...(perfil === "SECRETARIA" && sede
        ? {
            permissaoSede: {
              create: {
                sedeNome: sede,
              },
            },
          }
        : {}),
    },
  });
}

async function login(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

async function createAssignment(sede: string, status = "Pendente") {
  return prisma.professoresAtribuicoes.create({
    data: {
      sede,
      docente: "Docente de teste",
      matricula: `${Date.now()}-${Math.random()}`,
      email: "docente@example.com",
      totalHoras: 20,
      statusValidacao: status,
    },
  });
}

beforeEach(async () => {
  await prisma.historicoValidacao.deleteMany();
  await prisma.professoresAtribuicoes.deleteMany();
  await prisma.importacao.deleteMany();
  await prisma.sessao.deleteMany();
  await prisma.permissoesSede.deleteMany();
  await prisma.usuario.deleteMany();
  await createUser("ADMIN", "admin@test.local");
  await createUser("SECRETARIA", "secretaria@test.local", "Sede A");
});

afterAll(async () => {
  await prisma.historicoValidacao.deleteMany();
  await prisma.professoresAtribuicoes.deleteMany();
  await prisma.importacao.deleteMany();
  await prisma.sessao.deleteMany();
  await prisma.permissoesSede.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("autorização da API", () => {
  it("retorna 401 para rota admin sem login", async () => {
    await request(app).get("/api/admin/secretarias").expect(401);
  });

  it("retorna 403 para secretaria em rota admin", async () => {
    const agent = await login("secretaria@test.local");
    await agent.get("/api/admin/secretarias").expect(403);
  });

  it("impede secretaria de validar atribuição de outra sede", async () => {
    const assignment = await createAssignment("Sede B");
    const agent = await login("secretaria@test.local");

    await agent
      .put(`/api/secretaria/atribuicoes/${assignment.id}/validacao`)
      .send({ status: "Aprovado" })
      .expect(404);
  });
});

describe("regras de negócio da API", () => {
  it("retorna 400 ao rejeitar sem observação", async () => {
    const assignment = await createAssignment("Sede A");
    const agent = await login("secretaria@test.local");

    await agent
      .put(`/api/secretaria/atribuicoes/${assignment.id}/validacao`)
      .send({ status: "Rejeitado" })
      .expect(400);
  });

  it("retorna 409 ao validar atribuição já validada", async () => {
    const assignment = await createAssignment("Sede A", "Aprovado");
    const agent = await login("secretaria@test.local");

    await agent
      .put(`/api/secretaria/atribuicoes/${assignment.id}/validacao`)
      .send({ status: "Aprovado" })
      .expect(409);
  });

  it("retorna 409 ao reabrir atribuição que não está rejeitada", async () => {
    const assignment = await createAssignment("Sede A");
    const agent = await login("admin@test.local");

    await agent
      .put(`/api/admin/atribuicoes/${assignment.id}/reabrir`)
      .send({ totalHoras: 18 })
      .expect(409);
  });

  it("não altera a base quando a importação é inválida", async () => {
    const assignment = await createAssignment("Sede A");
    const agent = await login("admin@test.local");
    const invalidCsv =
      "Sede,Docente,Matrícula,EMAIL,Total Horas\nSede A,Outro,999,email-invalido,20";

    const response = await agent
      .post("/api/admin/atribuicoes/importar")
      .attach("arquivo", Buffer.from(invalidCsv), "invalido.csv")
      .expect(400);

    expect(response.body.error).toContain('"EMAIL" inválido');
    const persisted = await prisma.professoresAtribuicoes.findUnique({
      where: { id: assignment.id },
    });
    expect(persisted?.matricula).toBe(assignment.matricula);
  });
});
