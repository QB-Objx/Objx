let internalSequence = 0;

export function createInternalId(prefix: string): string {
  internalSequence += 1;
  return `${prefix}_${internalSequence.toString(36)}`;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }

  Object.freeze(value);

  for (const key of Object.getOwnPropertyNames(value)) {
    const nested = (value as Record<string, unknown>)[key];

    if (typeof nested === 'object' && nested !== null) {
      deepFreeze(nested);
    }
  }

  return value as Readonly<T>;
}

