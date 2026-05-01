export function notNull<T>(v: T | null): v is T {
  return v !== null;
}

/**
 * undefinedの場合、nullを返します。それ以外の場合は入力値をそのまま返します。
 */
export function nullify<T>(v: T | null | undefined): T | null {
  return v ?? null;
}
