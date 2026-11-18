import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./errors.js";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import secretariaRouter from "./routes/secretaria.js";
import { isAllowedRequestOrigin } from "./utils.js";

// Monta a aplicação Express sem iniciar o servidor HTTP.
export const app = express();

app.set("trust proxy", 1);
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

app.use(authRouter);
app.use(adminRouter);
app.use(secretariaRouter);
app.use(errorHandler);
