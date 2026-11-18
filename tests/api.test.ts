import { hash } from "bcryptjs";
import * as XLSX from "@e965/xlsx";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cookieName, createSession } from "../server/auth.js";
import { app } from "../server/app.js";
import { prisma } from "../server/db.js";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Defina TEST_DATABASE_URL com a URL de um banco Postgres exclusivo para testes.",
  );
}
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
) {
  throw new Error(
    "Os testes exigem DATABASE_URL igual ao TEST_DATABASE_URL exclusivo para testes.",
  );
}
if (!/^postgres(ql)?:\/\//i.test(process.env.TEST_DATABASE_URL)) {
  throw new Error("Os testes exigem um banco Postgres.");
}

const password = "senha-de-teste-123";

// Lê respostas XLSX como Buffer para que a biblioteca possa abrir o arquivo.
function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error: Error) => callback(error));
}

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
  const user = await prisma.usuario.findUnique({ where: { email } });
  if (!user) throw new Error(`Usuário de teste não encontrado: ${email}`);
  const session = await createSession(user.id);
  const agent = request.agent(app);
  agent.set("Cookie", `${cookieName}=${encodeURIComponent(session.token)}`);
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
    await request(app).post("/api/admin/secretarias/importar").expect(401);
  });

  it("retorna 403 para secretaria em rota admin", async () => {
    const agent = await login("secretaria@test.local");
    await agent.get("/api/admin/secretarias").expect(403);
    await agent.post("/api/admin/secretarias/importar").expect(403);
  });

  it("retorna 401 para exportação sem login", async () => {
    await request(app).get("/api/admin/atribuicoes/exportar").expect(401);
  });

  it("retorna 403 para exportação com conta de secretaria", async () => {
    const agent = await login("secretaria@test.local");
    await agent.get("/api/admin/atribuicoes/exportar").expect(403);
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
  it("importa secretarias em lote e permite login com uma conta criada", async () => {
    const agent = await login("admin@test.local");
    const csv =
      "Nome;E-mail;Sede;Senha\n" +
      "Ana Importada;ana.importada@test.local;Sede A;senha-de-teste-123\n" +
      "Bruno Importado;bruno.importado@test.local;Sede B;senha-de-teste-123";

    const response = await agent
      .post("/api/admin/secretarias/importar")
      .attach("arquivo", Buffer.from(csv), "secretarias.csv")
      .expect(201);

    expect(response.body).toEqual({
      criadas: 2,
      mensagem: "2 conta(s) de secretaria importada(s) com sucesso.",
    });
    const imported = await prisma.usuario.findMany({
      where: {
        email: { in: ["ana.importada@test.local", "bruno.importado@test.local"] },
      },
      include: { permissaoSede: true },
      orderBy: { email: "asc" },
    });
    expect(imported.map((user) => [user.perfil, user.permissaoSede?.sedeNome])).toEqual([
      ["SECRETARIA", "Sede A"],
      ["SECRETARIA", "Sede B"],
    ]);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "ana.importada@test.local", password })
      .expect(200);
  });

  it("rejeita duplicidade, e-mail existente, senha curta e e-mail inválido atomicamente", async () => {
    const agent = await login("admin@test.local");
    const csv =
      "Nome;E-mail;Sede;Senha\n" +
      "Existente;admin@test.local;Sede A;senha-de-teste-123\n" +
      "Senha curta;senha.curta@test.local;Sede A;curta\n" +
      "E-mail inválido;nao-e-mail;Sede B;senha-de-teste-123\n" +
      "Duplicada;duplicada@test.local;Sede A;senha-de-teste-123\n" +
      "Duplicada novamente;duplicada@test.local;Sede B;senha-de-teste-123";

    await agent
      .post("/api/admin/secretarias/importar")
      .attach("arquivo", Buffer.from(csv), "invalidas.csv")
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toContain("e-mail já cadastrado");
        expect(response.body.error).toContain("Senha");
        expect(response.body.error).toContain("E-mail");
        expect(response.body.error).toContain("e-mail repetido");
      });
    expect(
      await prisma.usuario.findUnique({ where: { email: "senha.curta@test.local" } }),
    ).toBeNull();
    expect(
      await prisma.usuario.findUnique({ where: { email: "duplicada@test.local" } }),
    ).toBeNull();
  });

  it("rejeita planilha com mais de 100 linhas", async () => {
    const agent = await login("admin@test.local");
    const rows = Array.from(
      { length: 101 },
      (_, index) =>
        `Nome ${index};secretaria${index}@test.local;Sede A;senha-de-teste-123`,
    ).join("\n");
    const csv = `Nome;E-mail;Sede;Senha\n${rows}`;

    await agent
      .post("/api/admin/secretarias/importar")
      .attach("arquivo", Buffer.from(csv), "muitas.csv")
      .expect(400, {
        error: "A planilha ultrapassa o limite de 100 linhas de dados.",
      });
    expect(await prisma.usuario.count()).toBe(2);
  });

  it("exporta todas as atribuições em duas abas XLSX", async () => {
    await createAssignment("Sede B", "Rejeitado");
    await createAssignment("Sede A", "Aprovado");
    await createAssignment("Sede C", "Pendente");
    const agent = await login("admin@test.local");

    const response = await agent
      .get("/api/admin/atribuicoes/exportar")
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const workbook = XLSX.read(response.body, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Atribuições", "Resumo"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["Atribuições"],
      { header: 1 },
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual([
      "Sede",
      "Docente",
      "Matrícula",
      "E-mail",
      "Horas solicitadas",
      "Status",
      "Observação",
      "Validada em",
      "Validada por",
    ]);
    expect(new Set(rows.slice(1).map((row) => row[5]))).toEqual(
      new Set(["Pendente", "Aprovado", "Rejeitado"]),
    );

    await createAssignment("Sede A");
    await createAssignment("Sede B");
    const selectedResponse = await agent
      .get("/api/admin/atribuicoes/exportar")
      .query({ sede: "Sede A" })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const selectedWorkbook = XLSX.read(selectedResponse.body, { type: "buffer" });
    const selectedRows = XLSX.utils.sheet_to_json<unknown[]>(
      selectedWorkbook.Sheets["Atribuições"],
      { header: 1 },
    );
    expect(selectedRows).toHaveLength(3);
    expect(selectedRows.slice(1).every((row) => row[0] === "Sede A")).toBe(true);

    await agent
      .get("/api/admin/atribuicoes/exportar")
      .query({ sede: "Sede inexistente" })
      .expect(404, { error: "Sede não encontrada." });
  });

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
