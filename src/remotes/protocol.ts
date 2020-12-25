import { readChunk } from "../services/FileService";
import { merge } from "../util/collection";

/** fluch packet */
const FLUSH_PACKET = "0000";
/** メッセージサイズ値のバイト数 */
const HEAD_SIZE = 4;

/**
 *  メッセージのフォーマット
 *  * ただし、一つ目のメッセージはRevisionの後に終端文字'\0'とCapabilitiesを含む
 *
 *  003e 98cdfbb84ad2ed6a2eb43dafa357a70a4b0a0fad refs/heads/maint \n
 *  ---- ---------------------------------------- ---------------- --
 *  Size Commit hash                               Revision        Terminator
 */
export class Protocol {
  /** コマンド名 */
  #command: string;
  /** クライアントでサポートしているCapabilities */
  #capsLocal: string[];
  /** サーバでサポートしているCapabilities */
  #capsRemote: string[] | null = null;
  /** Capabilitiesが送信済みか */
  #capsSent = false;
  constructor(
    command: string,
    public input: NodeJS.ReadableStream,
    public output: NodeJS.WritableStream,
    capabilities: string[] = []
  ) {
    this.#command = command;
    this.#capsLocal = capabilities;
  }

  sendPacket(line: string | null) {
    if (line === null) {
      return this.output.write(FLUSH_PACKET + "\n");
    }

    line = this.appendCaps(line);
    const LINE_SEP_SIZE = 1; // メッセージののバイト数
    const size = HEAD_SIZE + Buffer.from(line).length + LINE_SEP_SIZE;
    this.output.write(size.toString(16).padStart(4, "0"));
    this.output.write(line);
    this.output.write("\n");
  }

  async recvPacket(): Promise<string | null> {
    const rawHead = await readChunk(this.input, HEAD_SIZE);
    const head = rawHead.toString("utf8");
    if (!/[0-9a-f]{4}/.test(head)) {
      return head;
    }

    const size = Number.parseInt(head, 16);
    if (size === 0) {
      // flush packet
      return null;
    }

    const rawLine = await readChunk(this.input, size - HEAD_SIZE);
    const line = rawLine.toString("utf-8").replace("\n", "");
    return this.detectCaps(line);
  }

  /**
   * 送信される1行にCapabilitiesを追加します。
   * Capabilitiesが送信済みの場合は何も追加しません。
   *
   * @param line Capabilitesを追加する行
   */
  appendCaps(line: string) {
    if (this.#capsSent) {
      return line;
    }

    const separator = this.#command === "fetch" ? " " : "\0";
    let caps = new Set(this.#capsLocal);
    if (this.#capsRemote) {
      caps = merge(caps, new Set(this.#capsRemote));
    }

    return line + separator + Array.from(caps).join(" ");
  }

  detectCaps(line: string) {
    if (this.#capsRemote) {
      return line;
    }
    const [sep, n] = this.#command === "upload-pack" ? [" ", 3] : ["\n", 2];
    const parts = line.split(sep);
    const caps = parts.length >= n ? parts.slice(n).join(" ") : "";
    this.#capsRemote = caps.split(/ +/);
    return parts.join(" ");
  }

  capable(ability: string) {
    return this.#capsRemote?.includes(ability) ?? false;
  }

  async *recvUntil(terminator: string | null) {
    while (true) {
      const line = await this.recvPacket();
      if (line === terminator) {
        break;
      }
      yield line;
    }
  }
}
