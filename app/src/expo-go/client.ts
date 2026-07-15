import type { Periodo, PollClient } from "../core/client";
import type { Notas, Turma } from "../core/types";
import type { BridgeKind } from "./bridge";
import { parseNotas, parsePeriodos, parseTurmas } from "./validation";

export type PortalRequest = (
  kind: BridgeKind,
  numericId?: number,
) => Promise<unknown>;

/** PollClient backed by authenticated, same-origin fetches inside the WebView. */
export class ExpoGoPollClient implements PollClient {
  constructor(private readonly request: PortalRequest) {}

  async periodos(): Promise<Periodo[]> {
    return parsePeriodos(await this.request("periodos"));
  }

  async turmas(periodId: number): Promise<Turma[]> {
    assertPositiveId(periodId);
    return parseTurmas(await this.request("turmas", periodId));
  }

  async notas(enrollmentId: number): Promise<Notas> {
    assertPositiveId(enrollmentId);
    return parseNotas(await this.request("notas", enrollmentId));
  }
}

function assertPositiveId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Identificador acadêmico inválido.");
  }
}
