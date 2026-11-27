import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommitOptions } from "./inputs.ts";

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    return (await exec("git", args, { cwd })).stdout.trim();
  } catch (error) {
    const { stderr } = error as { stderr: string };
    throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
  }
}

/**
 * Commits the files, and only them, to the checked-out branch and pushes it. Returns false when
 * they have no change.
 */
export async function commitFiles(cwd: string, files: string[], options: CommitOptions): Promise<boolean> {
  if ((await git(cwd, "status", "--porcelain", "--", ...files)) === "") return false;
  const branch = await git(cwd, "branch", "--show-current");
  if (branch === "") {
    throw new Error(
      "commit needs a branch, and HEAD is detached: check out the branch " +
        "(in a pull request, actions/checkout with ref: ${{ github.head_ref }})",
    );
  }
  await git(cwd, "add", "--", ...files);
  await git(
    cwd,
    "-c",
    `user.name=${options.name}`,
    "-c",
    `user.email=${options.email}`,
    "commit",
    "--quiet",
    "-m",
    options.message,
    "--",
    ...files,
  );
  await git(cwd, "push", "--quiet", "origin", `HEAD:refs/heads/${branch}`);
  return true;
}
