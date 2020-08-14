import * as arg from "arg";
import { Commit } from "../../database";
import { Resolvable, Resolve } from "../../merge";
import { MergeType } from "../../repository/pending_commit";
import { Command, Sequencer } from "../../repository/sequencer";
import { CompleteCommit, Nullable } from "../../types";
import { assertsComplete } from "../../util/assert";
import { Base } from "../base";
import * as WriteCommit from "./write_commit";

const CONFLICT_NOTES = `  after resolving the conflicts, mark the corrected paths
  with 'kit add <paths>' or 'kit rm <paths>'
  and commit the result with 'kit commit'`;

export interface Options {
  mode: Nullable<"continue" | "abort" | "quit">;
}

export interface Sequence {
  sequencer: Sequencer;
  mergeType: MergeType;
  storeCommitSequence: () => Promise<void>;
  pick?: (commit: CompleteCommit) => Promise<void>;
  revert?: (commit: CompleteCommit) => Promise<void>;
}

export type SequenceCmmand = Base<Options> & Sequence;

export async function run(cmd: SequenceCmmand & WriteCommit.CommitPendable) {
  switch (cmd.options["mode"]) {
    case "continue":
      await handleContinue(cmd);
    case "quit":
      await handleQuit(cmd);
    case "abort":
      await handleAbort(cmd);
  }

  await cmd.sequencer.start();
  await cmd.storeCommitSequence();
  await resumeSequencer(cmd);
}

export function defineSpec(cmd: SequenceCmmand): arg.Spec {
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
  };
}

export function initOptions() {
  return {
    mode: null,
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

export async function finishCommit(commit: Commit, cmd: Base) {
  await cmd.repo.database.store(commit);
  assertsComplete(commit, "objectsへ保存されたコミットはOIDを持つ");
  await cmd.repo.refs.updateHead(commit.oid);
  await WriteCommit.printCommit(commit, cmd);
}

export async function failOnConflict(
  inputs: Resolvable,
  message: string,
  cmd: SequenceCmmand & WriteCommit.CommitPendable
) {
  await cmd.sequencer.dump();
  console.assert(inputs.rightOid !== null, `${inputs.rightOid} is null!`);
  await WriteCommit.pendingCommit(cmd).start(inputs.rightOid, cmd.mergeType);

  await cmd.editFile(WriteCommit.pendingCommit(cmd).messagePath, async (editor) => {
    await editor.puts(message);
    await editor.puts("");
    await editor.note("Conflicts:");
    for (const name of cmd.repo.index.conflictPaths()) {
      await editor.note(`\t${name}`);
    }
    editor.close();
  });

  cmd.logger.error(`error: could not apply ${inputs.rightName}`);
  CONFLICT_NOTES.split("\n").forEach((line) => cmd.logger.error(`hint: ${line}`));
  return cmd.exit(1);
}

export async function handleContinue(cmd: SequenceCmmand & WriteCommit.CommitPendable) {
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
    switch (e.constructor) {
      case WriteCommit:
        cmd.logger.error(`fatal: ${e.message}`);
        cmd.exit(128);
      default:
        throw e;
    }
  }

  return cmd.exit(0);
}

/**
 * 現在のHEADを維持したままコンフリクトを中断する
 */
export async function handleQuit(cmd: SequenceCmmand & WriteCommit.CommitPendable) {
  if (await WriteCommit.pendingCommit(cmd).inProgress()) {
    await WriteCommit.pendingCommit(cmd).clear(cmd.mergeType);
  }
  await cmd.sequencer.quit();
  return cmd.exit(0);
}

/**
 * cherry-pickを実行する直前の状態へ復帰して、コンフリクトを中断する
 */
export async function handleAbort(cmd: SequenceCmmand & WriteCommit.CommitPendable) {
  if (await WriteCommit.pendingCommit(cmd).inProgress()) {
    await WriteCommit.pendingCommit(cmd).clear(cmd.mergeType);
  }
  await cmd.repo.index.loadForUpdate();

  try {
    await cmd.sequencer.abort();
  } catch (e) {
    cmd.logger.warn(`warning: ${e.message}`);
  }
  await cmd.repo.index.writeUpdates();
  return cmd.exit(0);
}
