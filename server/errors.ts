import type { ErrorRequestHandler } from "express";
import multer from "multer";

// Representa falhas esperadas da API com o status HTTP correspondente.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Converte falhas esperadas e inesperadas em respostas HTTP consistentes.
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
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
