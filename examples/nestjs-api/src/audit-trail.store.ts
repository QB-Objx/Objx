import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditTrailStore {
  readonly #entries: unknown[] = [];

  append(entry: unknown): void {
    this.#entries.push(entry);
  }

  all(): readonly unknown[] {
    return this.#entries;
  }
}
