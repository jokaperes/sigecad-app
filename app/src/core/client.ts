import { buildSnapshot } from "./snapshot";
import type { Items, Labels, Notas, Turma } from "./types";

export const BASE = "https://sigecad-academico.app.ufgd.edu.br";


export class AuthError extends Error {}

export interface Periodo {
  id: number;
  nome: string;
  data_inicio?: string;
  data_fim?: string;
}


export class SigecadClient {
  private token: string;

  constructor(token: string) {
    const cookie = token.includes("=") ? token : `UFGDNET=${token}`;
    if (!cookie.startsWith("UFGDNET=") || /[;\r\n]/.test(cookie) || !cookie.slice(8).trim()) {
      throw new Error("Token deve ter o formato UFGDNET=<valor>.");
    }
    this.token = cookie;
  }

  async get<T>(path: string, retries = 2): Promise<T> {
    let res: Response;
    try {
      res = await fetch(BASE + path, {
        method: "GET",
        redirect: "manual",
        headers: {
          Cookie: this.token,
          Accept: "application/json, *
export interface PollClient {
  periodos(): Promise<Periodo[]>;
  turmas(periodId: number): Promise<Turma[]>;
  notas(matriculaId: number): Promise<Notas>;
}


export function currentPeriod(periodos: Periodo[]): Periodo {
  if (!periodos.length) throw new Error("SIGECAD não retornou nenhum período letivo");
  const today = new Date().toISOString().slice(0, 10);
  const active = periodos.filter(
    (p) => (p.data_inicio ?? "") <= today && today <= (p.data_fim ?? "9999-99-99"),
  );
  const pool = active.length ? active : periodos;
  return pool.reduce((a, b) => (b.id > a.id ? b : a));
}


export async function collectSnapshot(
  client: PollClient,
  periodId?: number,
): Promise<{ items: Items; labels: Labels }> {
  const pid = periodId ?? currentPeriod(await client.periodos()).id;
  const turmas = await client.turmas(pid);
  const notasByMatricula: Record<number, Notas> = {};
  let first = true;
  for (const t of turmas) {
    if (t.tem_notas) {
      if (!first) await sleep(300 + Math.random() * 900);
      first = false;
      notasByMatricula[t.matricula_id] = await client.notas(t.matricula_id);
    }
  }
  return buildSnapshot(turmas, notasByMatricula);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
