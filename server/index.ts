import "dotenv/config";
import { compare, hash } from "bcryptjs";
import { extname } from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import {
  authenticate,
  clearSessionCookie,
  createSession,
  requireRole,
  writeSessionCookie,
  type RequisicaoAutenticada,
} from "./auth";
import { prisma } from "./db";
import { parseSpreadsheet } from "./spreadsheet";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const maxFileSize = 5 * 1024 * 1024;
const allowedExtensions = new Set([".xls", ".xlsx", ".ods", ".csv"]);

// Representa falhas esperadas da API com o status HTTP correspondente.
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Valida a origem das operações que podem alterar dados.
function isAllowedRequestOrigin(origin: string, host: string | undefined) {
  try {
    const requestOrigin = new URL(origin).origin;
    const configuredOrigin = process.env.APP_ORIGIN;
    const allowedOrigins = configuredOrigin
      ? [new URL(configuredOrigin).origin]
      : process.env.NODE_ENV === "production"
        ? []
        : ["http://127.0.0.1:5173", "http://localhost:5173"];

    return allowedOrigins.length
      ? allowedOrigins.includes(requestOrigin)
      : new URL(origin).host === host;
  } catch {
    return false;
  }
}

app.disable("x-powered-by");
app.use(helmet());
// Impede solicitações mutáveis vindas de origens não autorizadas.
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin) {
    if (!isAllowedRequestOrigin(req.headers.origin, req.get("host"))) {
      res.status(403).json({ error: "A origem da solicitação não é permitida." });
      return;
    }
  }
  next();
});
app.use(express.json({ limit: "1mb" }));

// Limita tentativas de autenticação para reduzir abuso da rota de login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." },
});

// Recebe somente um arquivo em memória, com o limite definido para importações.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1 },
});

// Obtém a conta autenticada ou encerra a operação com erro de autorização.
function getAuthenticatedUser(req: RequisicaoAutenticada) {
  if (!req.usuario) throw new ApiError("Sessão não autenticada.", 401);
  return req.usuario;
}

// Normaliza e valida e-mails recebidos de formulários e endpoints.
function normalizeAndValidateEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError("Informe um e-mail válido.", 400);
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError("Informe um e-mail válido.", 400);
  }
  return email;
}

// Lista atribuições do administrador ou restringe os resultados à sede da secretaria.
async function listAssignmentsForUser(req: RequisicaoAutenticada) {
  const user = getAuthenticatedUser(req);
  const where =
    user.perfil === "SECRETARIA"
      ? { sede: user.sede ?? "" }
      : undefined;
  const assignments = await prisma.professoresAtribuicoes.findMany({
    where,
    include: {
      historicoValidacoes: {
        orderBy: [{ dataHora: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sede: "asc" }, { docente: "asc" }],
  });

  return assignments.map((assignment) => ({
    id: assignment.id,
    sede: assignment.sede,
    docente: assignment.docente,
    matricula: assignment.matricula,
    email: assignment.email,
    horasSolicitadas: assignment.totalHoras,
    status: assignment.statusValidacao,
    observacao: assignment.observacao,
    dataHoraInsercao: assignment.dataHoraInsercao,
    dataHoraValidacao: assignment.dataHoraValidacao,
    usuarioValidador: assignment.usuarioValidador,
    historicoValidacoes:
      user.perfil === "ADMIN" ? assignment.historicoValidacoes : [],
  }));
}

// Confirma que a API está disponível para verificações operacionais.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Autentica a conta, verifica seu perfil e cria uma sessão protegida.
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const email = normalizeAndValidateEmail(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    throw new ApiError("E-mail ou senha inválidos.", 401);
  }

  const user = await prisma.usuario.findUnique({
    where: { email },
    include: { permissaoSede: true },
  });
  const passwordMatches = user ? await compare(password, user.senhaHash) : false;
  if (!user || !user.ativo || !passwordMatches) {
    throw new ApiError("E-mail ou senha inválidos.", 401);
  }

  // Aceita apenas os perfis reconhecidos pelas rotas protegidas.
  if (user.perfil !== "ADMIN" && user.perfil !== "SECRETARIA") {
    throw new ApiError("A conta possui um perfil inválido.", 403);
  }
  if (
    (user.perfil === "ADMIN" && user.permissaoSede) ||
    (user.perfil === "SECRETARIA" && !user.permissaoSede)
  ) {
    throw new ApiError("A conta está sem uma permissão válida. Contate o administrador.", 403);
  }

  // Remove sessões expiradas antes de criar a nova sessão autenticada.
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });
  const session = await createSession(user.id);
  writeSessionCookie(res, session.token, session.expiresAt);
  res.json({
    usuario: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      perfil: user.perfil,
      sede: user.permissaoSede?.sedeNome ?? null,
    },
  });
});

// Retorna os dados da sessão autenticada atual.
app.get("/api/auth/me", authenticate, (req: RequisicaoAutenticada, res) => {
  res.json({ usuario: getAuthenticatedUser(req) });
});

// Revoga a sessão atual e remove o cookie do navegador.
app.post("/api/auth/logout", authenticate, async (req: RequisicaoAutenticada, res) => {
  if (req.sessaoId) {
    await prisma.sessao.delete({ where: { id: req.sessaoId } });
  }
  clearSessionCookie(res);
  res.status(204).end();
});

// Entrega atribuições permitidas para o perfil da sessão.
app.get(
  "/api/atribuicoes",
  authenticate,
  async (req: RequisicaoAutenticada, res) => {
    res.json({ atribuicoes: await listAssignmentsForUser(req) });
  },
);

// Lista os acessos de secretaria gerenciados pelo administrador.
app.get("/api/admin/secretarias", authenticate, requireRole("ADMIN"), async (_req, res) => {
  const permissions = await prisma.permissoesSede.findMany({
    include: {
      usuario: {
        select: { id: true, nome: true, email: true, ativo: true, criadoEm: true },
      },
    },
    orderBy: [{ sedeNome: "asc" }, { emailAutorizado: "asc" }],
  });
  res.json({
    secretarias: permissions.map((permission) => ({
      id: permission.usuario.id,
      sede: permission.sedeNome,
      email: permission.usuario.email,
      nome: permission.usuario.nome,
      ativo: permission.usuario.ativo,
      criadaEm: permission.usuario.criadoEm,
    })),
  });
});

// Lista as contas ADMIN que compartilham as permissões administrativas.
app.get(
  "/api/admin/administradores",
  authenticate,
  requireRole("ADMIN"),
  async (_req, res) => {
    const administrators = await prisma.usuario.findMany({
      where: { perfil: "ADMIN" },
      select: {
        id: true,
        email: true,
        nome: true,
        ativo: true,
        criadoEm: true,
      },
      orderBy: [{ nome: "asc" }, { email: "asc" }],
    });

    res.json({
      administradores: administrators.map((administrator) => ({
        id: administrator.id,
        email: administrator.email,
        nome: administrator.nome,
        ativo: administrator.ativo,
        criadaEm: administrator.criadoEm,
      })),
    });
  },
);

// Cadastra uma secretaria e vincula a conta à unidade autorizada.
app.post(
  "/api/admin/secretarias",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const email = normalizeAndValidateEmail(req.body?.email);
    const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
    const sede = typeof req.body?.sede === "string" ? req.body.sede.trim() : "";
    const password = req.body?.password;

    if (!nome || nome.length > 120 || !sede || sede.length > 160) {
      throw new ApiError("Informe o nome da pessoa e o nome da unidade.", 400);
    }
    if (typeof password !== "string" || password.length < 12 || password.length > 200) {
      throw new ApiError("A senha deve conter entre 12 e 200 caracteres.", 400);
    }
    if (await prisma.usuario.findUnique({ where: { email }, select: { id: true } })) {
      throw new ApiError("Já existe uma conta com este e-mail.", 409);
    }

    const created = await prisma.$transaction(async (transaction) => {
      return transaction.usuario.create({
        data: {
          email,
          nome,
          senhaHash: await hash(password, 12),
          perfil: "SECRETARIA",
          permissaoSede: {
            create: {
              sedeNome: sede,
            },
          },
        },
        select: { id: true },
      });
    });

    res.status(201).json({
      secretaria: { id: created.id, email, nome, sede, ativo: true },
    });
  },
);

// Cria outra conta ADMIN com as mesmas permissões da conta administradora inicial.
app.post(
  "/api/admin/administradores",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const email = normalizeAndValidateEmail(req.body?.email);
    const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
    const password = req.body?.password;

    if (!nome || nome.length > 120) {
      throw new ApiError("Informe o nome do administrador.", 400);
    }
    if (typeof password !== "string" || password.length < 12 || password.length > 200) {
      throw new ApiError("A senha deve conter entre 12 e 200 caracteres.", 400);
    }
    if (await prisma.usuario.findUnique({ where: { email }, select: { id: true } })) {
      throw new ApiError("Já existe uma conta com este e-mail.", 409);
    }

    const administrator = await prisma.usuario.create({
      data: {
        email,
        nome,
        senhaHash: await hash(password, 12),
        perfil: "ADMIN",
      },
      select: { id: true, email: true, nome: true, ativo: true, criadoEm: true },
    });

    res.status(201).json({
      administrador: {
        id: administrator.id,
        email: administrator.email,
        nome: administrator.nome,
        ativo: administrator.ativo,
        criadaEm: administrator.criadoEm,
      },
    });
  },
);

// Atualiza os dados de um administrador e invalida todas as suas sessões.
app.put(
  "/api/admin/administradores/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: RequisicaoAutenticada, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError("Identificador de administrador inválido.", 400);
    }
    if (id === getAuthenticatedUser(req).id) {
      throw new ApiError("Não é possível editar a própria conta nesta tela.", 409);
    }

    const email = normalizeAndValidateEmail(req.body?.email);
    const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
    const password = req.body?.password;
    if (!nome || nome.length > 120) {
      throw new ApiError("Informe o nome do administrador.", 400);
    }
    if (
      password !== undefined &&
      password !== "" &&
      (typeof password !== "string" || password.length < 12 || password.length > 200)
    ) {
      throw new ApiError("A nova senha deve conter entre 12 e 200 caracteres.", 400);
    }

    const existing = await prisma.usuario.findUnique({ where: { id } });
    if (!existing || existing.perfil !== "ADMIN") {
      throw new ApiError("A conta de administrador não foi encontrada.", 404);
    }
    const emailInUse = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailInUse && emailInUse.id !== id) {
      throw new ApiError("Já existe uma conta com este e-mail.", 409);
    }

    const administrator = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.usuario.update({
        where: { id },
        data: {
          email,
          nome,
          ...(typeof password === "string" && password
            ? { senhaHash: await hash(password, 12) }
            : {}),
        },
        select: { id: true, email: true, nome: true, ativo: true, criadoEm: true },
      });
      await transaction.sessao.deleteMany({ where: { usuarioId: id } });
      return updated;
    });

    res.json({
      administrador: {
        id: administrator.id,
        email: administrator.email,
        nome: administrator.nome,
        ativo: administrator.ativo,
        criadaEm: administrator.criadoEm,
      },
    });
  },
);

// Impede autoexclusão ou remoção do último administrador ainda ativo.
app.delete(
  "/api/admin/administradores/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: RequisicaoAutenticada, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError("Identificador de administrador inválido.", 400);
    }
    if (id === getAuthenticatedUser(req).id) {
      throw new ApiError("Não é possível excluir a própria conta.", 409);
    }

    const administrator = await prisma.usuario.findUnique({ where: { id } });
    if (!administrator || administrator.perfil !== "ADMIN") {
      throw new ApiError("A conta de administrador não foi encontrada.", 404);
    }
    if (administrator.ativo) {
      const activeAdministrators = await prisma.usuario.count({
        where: { perfil: "ADMIN", ativo: true },
      });
      if (activeAdministrators <= 1) {
        throw new ApiError("Não é possível excluir o último administrador ativo.", 409);
      }
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.importacao.updateMany({
        where: { usuarioId: id },
        data: { usuarioId: null, usuarioEmail: administrator.email },
      });
      await transaction.usuario.delete({ where: { id } });
    });
    res.status(204).end();
  },
);

// Atualiza os dados de acesso e encerra sessões da conta alterada.
app.put(
  "/api/admin/secretarias/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError("Identificador de secretaria inválido.", 400);
    }

    const email = normalizeAndValidateEmail(req.body?.email);
    const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
    const sede = typeof req.body?.sede === "string" ? req.body.sede.trim() : "";
    const password = req.body?.password;

    if (!nome || nome.length > 120 || !sede || sede.length > 160) {
      throw new ApiError("Informe o nome da pessoa e o nome da unidade.", 400);
    }
    if (
      password !== undefined &&
      password !== "" &&
      (typeof password !== "string" || password.length < 12 || password.length > 200)
    ) {
      throw new ApiError("A nova senha deve conter entre 12 e 200 caracteres.", 400);
    }

    const existing = await prisma.usuario.findUnique({
      where: { id },
      include: { permissaoSede: true },
    });
    if (!existing || existing.perfil !== "SECRETARIA" || !existing.permissaoSede) {
      throw new ApiError("A conta de secretaria não foi encontrada.", 404);
    }
    const permissionId = existing.permissaoSede.id;
    const emailInUse = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailInUse && emailInUse.id !== id) {
      throw new ApiError("Já existe uma conta com este e-mail.", 409);
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.permissoesSede.delete({
        where: { id: permissionId },
      });
      await transaction.usuario.update({
        where: { id },
        data: {
          email,
          nome,
          ...(typeof password === "string" && password
            ? { senhaHash: await hash(password, 12) }
            : {}),
        },
      });
      await transaction.permissoesSede.create({
        data: {
          sedeNome: sede,
          emailAutorizado: email,
        },
      });
      await transaction.sessao.deleteMany({ where: { usuarioId: id } });
    });

    res.json({
      secretaria: { id, email, nome, sede, ativo: existing.ativo },
    });
  },
);

// Remove a conta secretaria; relações vinculadas seguem as regras do schema.
app.delete(
  "/api/admin/secretarias/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError("Identificador de secretaria inválido.", 400);
    }

    const existing = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, perfil: true, permissaoSede: { select: { id: true } } },
    });
    if (!existing || existing.perfil !== "SECRETARIA" || !existing.permissaoSede) {
      throw new ApiError("A conta de secretaria não foi encontrada.", 404);
    }

    await prisma.usuario.delete({ where: { id } });
    res.status(204).end();
  },
);

// Valida a planilha antes de substituir a base em uma única transação.
app.post(
  "/api/admin/atribuicoes/importar",
  authenticate,
  requireRole("ADMIN"),
  upload.single("arquivo"),
  async (req: RequisicaoAutenticada, res) => {
    if (!req.file) throw new ApiError("Selecione uma planilha para importar.", 400);
    const extension = extname(req.file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new ApiError("Formato não permitido. Use .xls, .xlsx, .ods ou .csv.", 400);
    }

    let rows: ReturnType<typeof parseSpreadsheet>;
    try {
      const requestedSheet =
        typeof req.body?.aba === "string" ? req.body.aba : undefined;
      rows = parseSpreadsheet(req.file.buffer, req.file.originalname, requestedSheet);
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : "Não foi possível processar a planilha.",
        400,
      );
    }

    const authenticatedUser = getAuthenticatedUser(req);
    const sanitizedFileName = req.file.originalname.replace(/[\r\n]/g, "").slice(0, 180);
    // Grava as novas atribuições e o registro de importação atomicamente.
    const importRecord = await prisma.$transaction(async (transaction) => {
      await transaction.professoresAtribuicoes.deleteMany();
      await transaction.professoresAtribuicoes.createMany({
        data: rows.map((row) => ({
          sede: row.sede,
          docente: row.docente,
          matricula: row.matricula,
          email: row.email,
          totalHoras: row.totalHoras,
          statusValidacao: "Pendente",
        })),
      });
      return transaction.importacao.create({
        data: {
          nomeArquivo: sanitizedFileName,
          linhasLidas: rows.length,
          usuarioId: authenticatedUser.id,
          usuarioEmail: authenticatedUser.email,
        },
      });
    });

    res.status(201).json({
      mensagem: `Importação concluída: ${rows.length} atribuições foram gravadas.`,
      importacao: {
        id: importRecord.id,
        nomeArquivo: importRecord.nomeArquivo,
        linhasLidas: importRecord.linhasLidas,
        criadaEm: importRecord.criadaEm,
      },
    });
  },
);

// Esvazia apenas a base de atribuições ativas.
app.post(
  "/api/admin/atribuicoes/reset",
  authenticate,
  requireRole("ADMIN"),
  async (_req, res) => {
    const result = await prisma.professoresAtribuicoes.deleteMany();
    res.json({ mensagem: "A base de atribuições foi esvaziada.", removidas: result.count });
  },
);

// Reabre somente rejeições, preservando a decisão anterior no histórico.
app.put(
  "/api/admin/atribuicoes/:id/reabrir",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const id = Number(req.params.id);
    const totalHoras = Number(req.body?.totalHoras);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError("Identificador de atribuição inválido.", 400);
    }
    if (!Number.isFinite(totalHoras) || totalHoras <= 0 || totalHoras > 40) {
      throw new ApiError("Informe uma carga solicitada maior que 0 e até 40 horas.", 400);
    }

    await prisma.$transaction(async (transaction) => {
      const assignment = await transaction.professoresAtribuicoes.findUnique({
        where: { id },
        include: { historicoValidacoes: { select: { id: true } } },
      });
      if (!assignment) {
        throw new ApiError("A atribuição não foi encontrada.", 404);
      }
      // Somente rejeições podem ter a carga corrigida e voltar para nova análise.
      if (assignment.statusValidacao !== "Rejeitado") {
        throw new ApiError("Somente atribuições rejeitadas podem ser reabertas.", 409);
      }

      if (assignment.historicoValidacoes.length === 0) {
        await transaction.historicoValidacao.create({
          data: {
            atribuicaoId: assignment.id,
            status: assignment.statusValidacao,
            totalHoras: assignment.totalHoras,
            observacao: assignment.observacao,
            dataHora: assignment.dataHoraValidacao ?? new Date(),
            usuarioValidador: assignment.usuarioValidador,
          },
        });
      }

      await transaction.professoresAtribuicoes.update({
        where: { id },
        data: {
          totalHoras,
          statusValidacao: "Pendente",
          observacao: null,
          dataHoraValidacao: null,
          usuarioValidador: null,
        },
      });
    });

    res.json({
      mensagem: "Carga horária atualizada e reenviada à secretaria para nova validação.",
    });
  },
);

// Registra decisões da secretaria somente para atribuições pendentes da própria unidade.
app.put(
  "/api/secretaria/atribuicoes/:id/validacao",
  authenticate,
  requireRole("SECRETARIA"),
  async (req: RequisicaoAutenticada, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    const observation =
      typeof req.body?.observacao === "string" ? req.body.observacao.trim() : "";

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError("Identificador de atribuição inválido.", 400);
    }
    if (status !== "Aprovado" && status !== "Rejeitado") {
      throw new ApiError("Escolha uma decisão válida para a atribuição.", 400);
    }
    // A rejeição sempre precisa de uma justificativa não vazia.
    if (status === "Rejeitado" && !observation) {
      throw new ApiError("A observação é obrigatória para rejeitar a atribuição.", 400);
    }
    if (observation.length > 500) {
      throw new ApiError("A observação deve ter no máximo 500 caracteres.", 400);
    }

    const authenticatedUser = getAuthenticatedUser(req);
    if (!authenticatedUser.sede) {
      throw new ApiError("A conta não está vinculada a uma unidade.", 403);
    }
    const sede = authenticatedUser.sede;
    const updated = await prisma.$transaction(async (transaction) => {
      const assignment = await transaction.professoresAtribuicoes.findFirst({
        where: { id, sede },
      });
      if (!assignment) {
        throw new ApiError("Atribuição não encontrada para a sua unidade.", 404);
      }
      if (assignment.statusValidacao !== "Pendente") {
        throw new ApiError("Esta atribuição já foi validada.", 409);
      }

      const updatedAssignment = await transaction.professoresAtribuicoes.update({
        where: { id: assignment.id },
        data: {
          statusValidacao: status,
          observacao: status === "Rejeitado" ? observation : null,
          dataHoraValidacao: new Date(),
          usuarioValidador: authenticatedUser.email,
        },
      });
      await transaction.historicoValidacao.create({
        data: {
          atribuicaoId: updatedAssignment.id,
          status,
          totalHoras: updatedAssignment.totalHoras,
          observacao: updatedAssignment.observacao,
          dataHora: updatedAssignment.dataHoraValidacao ?? new Date(),
          usuarioValidador: updatedAssignment.usuarioValidador,
        },
      });
      return updatedAssignment;
    });

    res.json({
      atribuicao: {
        id: updated.id,
        status: updated.statusValidacao,
        observacao: updated.observacao,
        dataHoraValidacao: updated.dataHoraValidacao,
        usuarioValidador: updated.usuarioValidador,
      },
    });
  },
);

// Converte falhas esperadas e inesperadas em respostas HTTP consistentes.
const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    res
      .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "O arquivo ultrapassa o limite de 5 MB."
            : "Não foi possível receber o arquivo enviado.",
      });
    return;
  }

  console.error("Erro inesperado na API:", error);
  res.status(500).json({ error: "Ocorreu um erro interno. Tente novamente." });
};

app.use(errorHandler);

const server = app.listen(port, "127.0.0.1", () => {
  console.info(`API disponível em http://127.0.0.1:${port}`);
});

// Fecha o servidor e libera a conexão com o banco ao encerrar o processo.
async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
