import express from "express";
import {
  authenticate,
  requireRole,
  type RequisicaoAutenticada,
} from "../auth";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { getAuthenticatedUser } from "../utils";

const router = express.Router();

// Registra decisões da secretaria somente para atribuições pendentes da própria unidade.
router.put(
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

export default router;
