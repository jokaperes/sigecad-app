import { buildSnapshot } from "./snapshot";
import type { Items, Labels, Notas, Turma } from "./types";

export const BASE = "https://sigecad-academico.app.ufgd.edu.br";

/** Token UFGDNET inválido/expirado (302 -> login). O device deve pedir re-login. */
export class AuthError extends Error {}

export interface Periodo {
  id: number;
  nome: string;
  data_inicio?: string;
  data_fim?: string;
}

/**
 * Cliente de poll do SIGECAD. Espelha a classe `Client` de sigecad.py, mas com
 * `fetch` (Node/React Native). O cookie UFGDNET fica no device e é injetado por
 * request; nunca é enviado a terceiros. Só GET (somente leitura).
 */
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
        redirect: "manual", // 302 -> login vira AuthError, não segue
        headers: {
          Cookie: this.token,
          Accept: "application/json, */*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "User-Agent": "sigecad-notifier/0.1",
        },
      });
    } catch (e) {
      if (retries > 0) {
        await sleep(1500 * (3 - retries));
        return this.get<T>(path, retries - 1);
      }
      throw e;
    }

    // redirect:"manual" -> status 0 (opaqueredirect) ou 3xx = sem sessão
    if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
      throw new AuthError(`HTTP ${res.status} -> login`);
    }
    if (res.status >= 500 && retries > 0) {
      await sleep(1500 * (3 - retries));
      return this.get<T>(path, retries - 1);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} em ${path}`);
    }
    return (await res.json()) as T;
  }

  periodos() {
    return this.get<Periodo[]>("/rest/periodosletivos");
  }
  turmas(periodId: number) {
    return this.get<Turma[]>(`/rest/turmas?periodoLetivoID=${periodId}`);
  }
  notas(matriculaId: number) {
    return this.get<Notas>(`/rest/notas?matriculaID=${matriculaId}`);
  }
}

/** Interface mínima de poll (a classe acima implementa; facilita testar com fakes). */
export interface PollClient {
  periodos(): Promise<Periodo[]>;
  turmas(periodId: number): Promise<Turma[]>;
  notas(matriculaId: number): Promise<Notas>;
}

/** Período atual: janela [data_inicio, data_fim] que contém hoje; senão o maior id. */
export function currentPeriod(periodos: Periodo[]): Periodo {
  if (!periodos.length) throw new Error("SIGECAD não retornou nenhum período letivo");
  const today = new Date().toISOString().slice(0, 10);
  const active = periodos.filter(
    (p) => (p.data_inicio ?? "") <= today && today <= (p.data_fim ?? "9999-99-99"),
  );
  const pool = active.length ? active : periodos;
  return pool.reduce((a, b) => (b.id > a.id ? b : a));
}

/**
 * Coleta ponta a ponta (espelha `snapshot` de sigecad.py): períodos -> turmas
 * -> notas de cada disciplina com nota -> buildSnapshot. Educado com o servidor:
 * um pequeno jitter entre chamadas de /rest/notas.
 */
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
