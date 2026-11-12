import { hash } from "bcryptjs";
import { extname } from "node:path";
import express from "express";
import multer from "multer";
import {
  authenticate,
  requireRole,
  type RequisicaoAutenticada,
} from "../auth";
import { prisma } from "../db";
import { ApiError } from "../errors";
import {
  administratorIdSchema,
  assignmentIdSchema,
  createAdministratorSchema,
  createSecretarySchema,
  reopenSchema,
  secretaryIdSchema,
  updateAdministratorSchema,
  updateSecretarySchema,
} from "../schemas";
import { parseSpreadsheet } from "../spreadsheet";
import { getAuthenticatedUser, parseSchema } from "../utils";

const router = express.Router();
const maxFileSize = 5 * 1024 * 1024;
const allowedExtensions = new Set([".xls", ".xlsx", ".ods", ".csv"]);

// Recebe somente um arquivo em memória, com o limite definido para importações.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1 },
});

// Lista os acessos de secretaria gerenciados pelo administrador.
router.get("/api/admin/secretarias", authenticate, requireRole("ADMIN"), async (_req, res) => {
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
router.get(
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
router.post(
  "/api/admin/secretarias",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const { email, nome, sede, password } = parseSchema(
      createSecretarySchema,
      req.body,
    );
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
router.post(
  "/api/admin/administradores",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const { email, nome, password } = parseSchema(
      createAdministratorSchema,
      req.body,
    );
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
router.put(
  "/api/admin/administradores/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: RequisicaoAutenticada, res) => {
    const id = parseSchema(administratorIdSchema, req.params.id);
    if (id === getAuthenticatedUser(req).id) {
      throw new ApiError("Não é possível editar a própria conta nesta tela.", 409);
    }

    const { email, nome, password } = parseSchema(
      updateAdministratorSchema,
      req.body,
    );

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
router.delete(
  "/api/admin/administradores/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: RequisicaoAutenticada, res) => {
    const id = parseSchema(administratorIdSchema, req.params.id);
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
router.put(
  "/api/admin/secretarias/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const id = parseSchema(secretaryIdSchema, req.params.id);
    const { email, nome, sede, password } = parseSchema(
      updateSecretarySchema,
      req.body,
    );

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
router.delete(
  "/api/admin/secretarias/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const id = parseSchema(secretaryIdSchema, req.params.id);

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
router.post(
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
router.post(
  "/api/admin/atribuicoes/reset",
  authenticate,
  requireRole("ADMIN"),
  async (_req, res) => {
    const result = await prisma.professoresAtribuicoes.deleteMany();
    res.json({ mensagem: "A base de atribuições foi esvaziada.", removidas: result.count });
  },
);

// Reabre somente rejeições, preservando a decisão anterior no histórico.
router.put(
  "/api/admin/atribuicoes/:id/reabrir",
  authenticate,
  requireRole("ADMIN"),
  async (req, res) => {
    const id = parseSchema(assignmentIdSchema, req.params.id);
    const { totalHoras } = parseSchema(reopenSchema, req.body);

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

export default router;
