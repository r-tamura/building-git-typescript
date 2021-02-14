export function bufferForDisplay(
  buffer: Buffer,
  { pretty = true }: { pretty?: boolean } = {},
): string {
  const bytes = [...buffer].map((b) => b.toString(16).padStart(2, "0"));
  if (!pretty) {
    return bytes.join(" ");
  }
  const BLOCK_SIZE = 4;
  const ROW_SIZE_BY_BLOCK = 4;

  return bytes
    .reduce(blockFn(BLOCK_SIZE), [] as string[][])
    .map((block) => block.join(" "))
    .reduce(blockFn(ROW_SIZE_BY_BLOCK), [] as string[][])
    .map((row) => row.join("  "))
    .join("\n");
}

function blockFn(blockSize: number) {
  return (acc: string[][], v: string, i: number) => {
    const blockId = Math.floor(i / blockSize);
    if (i % blockSize === 0) {
      acc.push([v]);
    } else {
      acc[blockId].push(v);
    }
    return acc;
  };
}

/**
 * 環境変数DEBUGが存在する場合にのみログを標準出力へ出力します
 * @param message メッセージ
 * @param optionalparams
 */
export function debug(message: any, ...optionalParams: any[]): void {
  if (process.env.NODE_DEBUG) {
    console.debug(message, ...optionalParams);
  }
}
