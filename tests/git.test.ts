import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { commitFiles } from "../src/git.ts";

const author = { message: "docs: diagram", name: "Bot", email: "bot@example.com" };
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let remote: string;
let work: string;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "er-git-"));
  remote = join(root, "remote.git");
  work = join(root, "work");
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote]);
  execFileSync("git", ["clone", "--quiet", remote, work], { stdio: "ignore" });
  git(work, "config", "user.name", "Someone");
  git(work, "config", "user.email", "someone@example.com");
  writeFileSync(join(work, "README.md"), "# App\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "init");
  git(work, "push", "--quiet", "origin", "main");
});

describe("commitFiles", () => {
  test("commits only the given files, as the author, and pushes the branch", async () => {
    writeFileSync(join(work, "diagram.mmd"), "erDiagram\n");
    writeFileSync(join(work, "README.md"), "# App\n\nchanged\n");
    writeFileSync(join(work, "other.txt"), "not mine\n");
    git(work, "add", "other.txt");

    expect(await commitFiles(work, ["diagram.mmd", "README.md"], author)).toBe(true);

    expect(git(remote, "log", "-1", "--format=%an <%ae> %s", "main")).toBe(
      "Bot <bot@example.com> docs: diagram",
    );
    expect(git(remote, "show", "--name-only", "--format=", "main").split("\n").sort()).toEqual([
      "README.md",
      "diagram.mmd",
    ]);
    // What the user staged stays staged, and out of the commit.
    expect(git(work, "status", "--porcelain")).toBe("A  other.txt");
  });

  test("nothing to commit is no commit", async () => {
    expect(await commitFiles(work, ["README.md"], author)).toBe(false);
    expect(git(remote, "rev-list", "--count", "main")).toBe("1");
  });

  test("a detached HEAD is an error that says how to check out the branch", async () => {
    git(work, "checkout", "--quiet", "--detach");
    writeFileSync(join(work, "diagram.mmd"), "erDiagram\n");
    await expect(commitFiles(work, ["diagram.mmd"], author)).rejects.toThrow(
      /HEAD is detached.*ref: \$\{\{ github\.head_ref \}\}/,
    );
  });

  test("a failed push says what git said", async () => {
    git(work, "remote", "set-url", "origin", join(work, "missing.git"));
    writeFileSync(join(work, "diagram.mmd"), "erDiagram\n");
    await expect(commitFiles(work, ["diagram.mmd"], author)).rejects.toThrow(/git push failed:.*missing\.git/s);
  });
});
