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
 * they have no change. When the branch moved meanwhile (another job pushed), the commit is rebased
 * on it and pushed again, three tries in all.
 */
export async function commitFiles(
  cwd: string,
  files: string[],
  options: CommitOptions,
): Promise<boolean> {
  if ((await git(cwd, "status", "--porcelain", "--", ...files)) === "") return false;
  const branch = await git(cwd, "branch", "--show-current");
  if (branch === "") {
    throw new Error(
      "commit needs a branch, and HEAD is detached: check out the branch " +
        // The workflow expression is the text to copy, not a placeholder.
        // biome-ignore lint/suspicious/noTemplateCurlyInString: shown to the user as is
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
  for (let attempt = 1; ; attempt++) {
    try {
      await git(cwd, "push", "--quiet", "origin", `HEAD:refs/heads/${branch}`);
      return true;
    } catch (error) {
      if (attempt === 3) throw error;
      // What the user staged is stashed and back after the rebase.
      await git(cwd, "pull", "--quiet", "--rebase", "--autostash", "origin", branch).catch(() => {
        throw error;
      });
    }
  }
}
