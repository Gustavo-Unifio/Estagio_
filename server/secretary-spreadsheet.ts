import * as XLSX from "@e965/xlsx";
import * as codepages from "@e965/xlsx/dist/cpexcel";
import { parse as parseCsv } from "csv-parse/sync";
import { extname } from "node:path";
import { normalizeColumnHeader } from "./spreadsheet";

export type LinhaSecretariaImportada = {
  linha: number;
  nome: string;
  email: string;
  sede: string;
  password: string;
};

const maxSecretaryRows = 100;
const headerSearchRows = 30;
const expectedHeaders = ["nome", "email", "sede", "senha"];

XLSX.set_cptable(codepages);

// Localiza as quatro colunas obrigatórias nas primeiras linhas da planilha.
function findSecretaryHeader(rows: unknown[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, headerSearchRows); rowIndex += 1) {
    const header = rows[rowIndex].map((value) =>
      normalizeColumnHeader(value).replace(/-/g, ""),
    );
    const indexes = expectedHeaders.map((expected) => header.indexOf(expected));
    if (indexes.every((index) => index >= 0)) {
      return { headerRow: rowIndex, indexes };
    }
  }
  return null;
}

// Lê linhas não vazias e preserva a numeração original da planilha.
function getSecretaryRows(rows: unknown[][], headerRow: number, indexes: number[]) {
  return rows
    .slice(headerRow + 1)
    .map((row, index) => ({
      row,
      linha: headerRow + index + 2,
    }))
    .filter(({ row }) => row.some((value) => String(value ?? "").trim() !== ""))
    .map(({ row, linha }) => ({
      linha,
      nome: String(row[indexes[0]] ?? ""),
      email: String(row[indexes[1]] ?? ""),
      sede: String(row[indexes[2]] ?? ""),
      password: String(row[indexes[3]] ?? ""),
    }));
}

// Lê CSV ou planilha e retorna somente os dados estruturais das contas.
export function parseSecretarySpreadsheet(
  buffer: Buffer,
  fileName: string,
): LinhaSecretariaImportada[] {
  let rows: unknown[][];
  if (extname(fileName).toLowerCase() === ".csv") {
    try {
      rows = parseCsv(buffer, {
        bom: true,
        delimiter: [",", ";", "\t"],
        skip_empty_lines: true,
        trim: false,
        max_record_size: 10_000,
      }) as unknown[][];
    } catch {
      throw new Error("Não foi possível ler o CSV. Verifique a codificação e os separadores.");
    }
  } else {
    try {
      const workbook = XLSX.read(buffer, {
        type: "buffer",
        cellDates: false,
        dense: false,
      });
      rows = [];
      const firstSheet = workbook.SheetNames[0];
      if (firstSheet) {
        const worksheet = workbook.Sheets[firstSheet];
        if (worksheet) {
          rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            raw: false,
            defval: "",
            blankrows: true,
          });
        }
      }
    } catch {
      throw new Error("Não foi possível ler o arquivo. Verifique o formato e tente novamente.");
    }
  }

  const header = findSecretaryHeader(rows);
  if (!header) {
    throw new Error(
      "A planilha não contém as colunas obrigatórias: Nome, E-mail, Sede e Senha.",
    );
  }

  const entries = getSecretaryRows(rows, header.headerRow, header.indexes);
  if (entries.length === 0) {
    throw new Error("A planilha não contém linhas para importar.");
  }
  if (entries.length > maxSecretaryRows) {
    throw new Error("A planilha ultrapassa o limite de 100 linhas de dados.");
  }

  return entries.map((entry) => ({
    ...entry,
    nome: entry.nome,
    email: entry.email,
    sede: entry.sede,
    password: entry.password,
  }));
}
