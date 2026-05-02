import arg, { type Spec } from "@kit/core/util/arg";
import { assertsNumber } from "@kit/core/config";
import type { Commit } from "@kit/core/database";
import type { Resolvable } from "@kit/core/merge";
import { Resolve } from "@kit/core/merge";
import type { MergeType } from "@kit/core/repository/pending_commit";
import type { Command, Sequencer } from "@kit/core/repository/sequencer";
import type { SequencerOptions } from "@kit/core/repository/sequencer_options";
import type { CompleteCommit, Nullable } from "@kit/core/types";
import { asserts, assertsComplete } from "@kit/core/util/assert";
import { isObject } from "@kit/core/util/object";
import type { BaseCommand } from "../base";
import * as WriteCommit from "./write_commit";

const CONFLICT_NOTES = `  after resolving the conflicts, mark the corrected paths
  with 'kit add <paths>' or 'kit rm <paths>'
  and commit the result with 'kit commit'`;

export type Options = SequencerOptions;

export interface Sequence {
  sequencer: Sequencer;
  mergeType: MergeType;
  storeCommitSequence: () => Promise<void>;
  pick?: (commit: CompleteCommit) => Promise<void>;
  revert?: (commit: CompleteCommit) => Promise<void>;
}

export type SequenceCmmand = BaseCommand<Options> & Sequence;

export async function run(cmd: SequenceCmmand & WriteCommit.CommitPendable) {
  switch (cmd.options["mode"]) {
    case "continue":
      await handleContinue(cmd);
      break;
    case "quit":
      await handleQuit(cmd);
      break;
    case "abort":
      await handleAbort(cmd);
      break;
  }

  await cmd.sequencer.start(cmd.options);
  await cmd.storeCommitSequence();
  await resumeSequencer(cmd);
}

export function defineSpec(cmd: SequenceCmmand): Spec {
  return {
    "--continue": arg.flag(() => {
      cmd.options["mode"] = "continue";
    }),
    "--quit": arg.flag(() => {
      cmd.options["mode"] = "quit";
    }),
    "--abort": arg.flag(() => {
      cmd.options["mode"] = "abort";
    }),
    "--mainline": (value: string) => {
      cmd.options["mainline"] = Number.parseInt(value);
    },
    "-m": "--mainline",
  };
}

export function initOptions() {
  return {
    mode: null,
    mainline: 1,
  };
}

export async function resumeSequencer(cmd: SequenceCmmand) {
  let command: Nullable<Command>;
  while ((command = cmd.sequencer.nextCommand())) {
    // Note: rubyの場合、 nilでもdestructing assignmentできるが、JSはできない
    const [action, commit] = command;

    switch (action) {
      case "pick":
        // コマンドがpick機能を持っている
        await cmd.pick?.(commit);
        break;
      case "revert":
        // コマンドがrevert機能を持っている
        await cmd.revert?.(commit);
        break;
    }
    await cmd.sequencer.dropCommand();
  }
  await cmd.sequencer.quit();
  return cmd.exit(0);
}

export async function resolveMerge(inputs: Resolvable, cmd: SequenceCmmand) {
  await cmd.repo.index.loadForUpdate();
  await new Resolve(cmd.repo, inputs).execute();
  await cmd.repo.index.writeUpdates();
}

export async function finishCommit(commit: Commit, cmd: BaseCommand) {
  await cmd.repo.database.store(commit);
  assertsComplete(commit, "objectsへ保存されたコミットはOIDを持つ");
  await cmd.repo.refs.updateHead(commit.oid);
  await WriteCommit.printCommit(commit, cmd);
}

export async function failOnConflict(
  inputs: Resolvable,
  message: string,
  cmd: SequenceCmmand & WriteCommit.CommitPendable,
) {
  await cmd.sequencer.dump();
  asserts(inputs.rightOid !== null, `${inputs.rightOid} is null!`);
  await WriteCommit.pendingCommit(cmd).start(inputs.rightOid, cmd.mergeType);

  await cmd.editFile(
    WriteCommit.pendingCommit(cmd).messagePath,
    async (editor) => {
      await editor.puts(message);
      await editor.puts("");
      await editor.note("Conflicts:");
      for (const name of cmd.repo.index.conflictPaths()) {
        await editor.note(`\t${name}`);
      }
      editor.close();
    },
  );

  cmd.logger.error(`error: could not apply ${inputs.rightName}`);
  CONFLICT_NOTES.split("\n").forEach((line) =>
    cmd.logger.error(`hint: ${line}`),
  );
  return cmd.exit(1);
}

export async function selectParent(
  commit: CompleteCommit,
  cmd: SequenceCmmand,
) {
  const mainline = await cmd.sequencer.getOption("mainline");
  assertsNumber(mainline);

  if (commit.merge) {
    if (mainline) {
      return commit.parents[mainline - 1];
    }

    cmd.logger.error(
      `error: commit ${commit.oid} is a merge but no -m option was given`,
    );
    cmd.exit(1);
  } else {
    if (!mainline) {
      return commit.parent;
    }

    cmd.logger.error(
      `error: mainline was specified but commit ${commit.oid} is not a merge`,
    );
    cmd.exit(1);
  }
}

export async function handleContinue(
  cmd: SequenceCmmand & WriteCommit.CommitPendable,
) {
  try {
    await cmd.repo.index.load();

    const mergeType = await WriteCommit.pendingCommit(cmd).mergeType();
    switch (mergeType) {
      case "cherry_pick":
        await WriteCommit.writeCherryPickCommit(cmd);
        break;
      case "revert":
        await WriteCommit.writeRevertCommit(cmd);
        break;
    }

    await cmd.sequencer.load();
    await cmd.sequencer.dropCommand();
    await resumeSequencer(cmd);
  } catch (e) {
    asserts(isObject(e), "unknown error");
    switch (e.constructor) {
      // TODO: なんのエラーをちゃっちしているかわからないので、正しいエラーを指定する
      // case WriteCommit:
      case Error:
        cmd.logger.error(`fatal: ${e.message}`);
        cmd.exit(128);
        break;
      default:
        throw e;
    }
  }

  return cmd.exit(0);
}

/**
 * 現在のHEADを維持したままコンフリクトを中断する
 */
export async function handleQuit(
  cmd: SequenceCmmand & WriteCommit.CommitPendable,
) {
  if (await WriteCommit.pendingCommit(cmd).inProgress()) {
    await WriteCommit.pendingCommit(cmd).clear(cmd.mergeType);
  }
  await cmd.sequencer.quit();
  return cmd.exit(0);
}

/**
 * cherry-pickを実行する直前の状態へ復帰して、コンフリクトを中断する
 */
export async function handleAbort(
  cmd: SequenceCmmand & WriteCommit.CommitPendable,
) {
  if (await WriteCommit.pendingCommit(cmd).inProgress()) {
    await WriteCommit.pendingCommit(cmd).clear(cmd.mergeType);
  }
  await cmd.repo.index.loadForUpdate();

  try {
    await cmd.sequencer.abort();
  } catch (e) {
    asserts(e instanceof Error, "unknown error");
    cmd.logger.warn(`warning: ${e.message}`);
  }
  await cmd.repo.index.writeUpdates();
  return cmd.exit(0);
}
