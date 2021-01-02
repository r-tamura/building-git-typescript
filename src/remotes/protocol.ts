import { readChunk } from "../services/FileService";
import * as array from "../util/collection";

/** fluch packet */
const FLUSH_PACKET = "0000";
/** メッセージサイズ値のバイト数 */
const HEAD_SIZE = 4;

const FETCH_SEP = " ";
const OTHERS_SEP = "\0";

function log(command: string, ...messages: (string | number | Buffer)[]) {
  if (command === "fetch") {
    // console.log({ client: messages });
  } else if (command === "upload-pack") {
    console.warn({ remote: messages });
  } else {
    console.warn(`${command} is not supported`);
  }
}

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

  sendPacket(line: string | null): void {
    if (line === null) {
      log(this.#command, "send", "flash");
      this.output.write(FLUSH_PACKET);
      return;
    }

    line = this.appendCaps(line);
    const LINE_SEP_SIZE = 1; // メッセージののバイト数
    const size = HEAD_SIZE + Buffer.from(line).length + LINE_SEP_SIZE;
    this.output.write(size.toString(16).padStart(4, "0"));
    log(this.#command, "send", line);
    this.output.write(line);
    this.output.write("\n");
  }

  async recvPacket(): Promise<string | null> {
    const rawHead = await readChunk(this.input, HEAD_SIZE);
    const head = rawHead.toString("utf8");
    if (!/[0-9a-f]{4}/.test(head)) {
      log(this.#command, "recv", "head", head);
      return head;
    }

    const size = Number.parseInt(head, 16);
    log(this.#command, "recv", "flash?", head, size);
    if (size === 0) {
      // flush packet
      return null;
    }

    const rawLine = await readChunk(this.input, size - HEAD_SIZE);
    const line = rawLine.toString("utf-8").replace("\n", "");
    log(this.#command, "recv", "line", line);
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
    this.#capsSent = true;

    const separator = this.#command === "fetch" ? FETCH_SEP : OTHERS_SEP;
    let caps = new Set(this.#capsLocal);
    if (this.#capsRemote) {
      caps = array.intersection(caps, new Set(this.#capsRemote));
    }
    return line + separator + Array.from(caps).join(" ");
  }

  detectCaps(line: string) {
    if (this.#capsRemote) {
      return line;
    }
    /*
    fetchコマンド側が送信するイニシャルパケットの形式
    want [SHA-1] [cap1, cap2,...]

    upload-packコマンド側のイニシャルパケットの形式
    [SHA1] [ref]\0[cap1, cap2, ...]

    受信側なのでsepはsend時と反対になる
    */
    const [sep, n] =
      this.#command === "upload-pack" ? [FETCH_SEP, 3] : [OTHERS_SEP, 2];
    const parts = line.split(sep);
    const caps = parts.length >= n ? parts.slice(n).join(" ") : "";
    this.#capsRemote = caps.split(/ +/);
    return parts.slice(0, n - 1).join(" ");
  }

  capable(ability: string) {
    return this.#capsRemote?.includes(ability) ?? false;
  }

  async *recvUntil(terminator: string | null) {
    while (true) {
      const line = await this.recvPacket();
      if (line === terminator) {
        log(this.#command, "terminate", JSON.stringify(line));
        break;
      }
      yield line;
    }
  }
}
