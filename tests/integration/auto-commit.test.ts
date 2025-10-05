import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { $ } from "bun";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("Auto-Commit Integration Tests", () => {
  let testDir: string;
  let outputDir: string;
  let diagramFile: string;
  let readmePath: string;

  beforeAll(() => {
    // Create a temporary directory for testing
    testDir = mkdtempSync(join(tmpdir(), "er-diagram-test-"));
    outputDir = `${testDir}/output`;
    diagramFile = `${outputDir}/database-er-diagram.mmd`;
    readmePath = `${testDir}/README.md`;
  });

  beforeEach(async () => {
    // Remove .git directory to start fresh
    await $`rm -rf ${testDir}/.git ${outputDir}`.quiet();
    await $`mkdir -p ${outputDir}`.quiet();

    // Initialize a fresh git repo for each test
    await $`git init ${testDir}`.quiet();
    await $`git -C ${testDir} config user.name "Test User"`.quiet();
    await $`git -C ${testDir} config user.email "test@example.com"`.quiet();

    // Create initial README
    await Bun.write(readmePath, "# Test Repository\n\nInitial content\n");

    // Create initial commit
    await $`git -C ${testDir} add .`.quiet();
    await $`git -C ${testDir} commit -m "Initial commit"`.quiet();
  });

  afterAll(() => {
    // Cleanup test directory completely
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to cleanup test directory:", error);
    }
  });

  test("should detect changes in diagram file", async () => {
    // Write a diagram file
    await Bun.write(diagramFile, "erDiagram\n  users {\n    id int PK\n  }\n");

    // Check git status
    const status = await $`git -C ${testDir} status --porcelain ${diagramFile.replace(testDir + '/', '')}`.quiet();
    const hasChanges = status.stdout.toString().trim().length > 0;

    expect(hasChanges).toBe(true);
  });

  test("should detect no changes when file is unchanged", async () => {
    // Write and commit a file
    await Bun.write(diagramFile, "erDiagram\n  users {\n    id int PK\n  }\n");
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m "Add diagram"`.quiet();

    // Check git status again (should be clean)
    const status = await $`git -C ${testDir} status --porcelain ${diagramFile.replace(testDir + '/', '')}`.quiet();
    const hasChanges = status.stdout.toString().trim().length > 0;

    expect(hasChanges).toBe(false);
  });

  test("should stage and commit diagram file", async () => {
    // Modify diagram
    await Bun.write(diagramFile, "erDiagram\n  users {\n    id int PK\n    email varchar UK\n  }\n");

    // Add and commit
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m "docs: update ER diagram"`.quiet();

    // Verify commit exists
    const log = await $`git -C ${testDir} log --oneline -1`.quiet();
    expect(log.stdout.toString()).toContain("update ER diagram");
  });

  test("should commit both diagram and README when both change", async () => {
    // Modify both files
    await Bun.write(diagramFile, "erDiagram\n  products {\n    id int PK\n  }\n");
    await Bun.write(readmePath, "# Test Repository\n\nUpdated content with diagram\n");

    // Add and commit both
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')} ${readmePath.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m "docs: update ER diagram [skip ci]"`.quiet();

    // Verify commit message has [skip ci]
    const log = await $`git -C ${testDir} log --oneline -1`.quiet();
    expect(log.stdout.toString()).toContain("[skip ci]");
  });

  test("should use custom commit message", async () => {
    // Modify diagram
    await Bun.write(diagramFile, "erDiagram\n  orders {\n    id int PK\n  }\n");

    const customMessage = "chore: automated diagram update";

    // Add and commit with custom message
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m ${customMessage}`.quiet();

    // Verify custom message
    const log = await $`git -C ${testDir} log --oneline -1`.quiet();
    expect(log.stdout.toString()).toContain("automated diagram update");
  });

  test("should use custom author information", async () => {
    // Configure custom author
    const authorName = "GitHub Actions Bot";
    const authorEmail = "actions@github.com";

    await $`git -C ${testDir} config user.name ${authorName}`.quiet();
    await $`git -C ${testDir} config user.email ${authorEmail}`.quiet();

    // Modify and commit
    await Bun.write(diagramFile, "erDiagram\n  payments {\n    id int PK\n  }\n");
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m "docs: update diagram"`.quiet();

    // Verify author
    const author = await $`git -C ${testDir} log -1 --format="%an <%ae>"`.quiet();
    expect(author.stdout.toString().trim()).toBe(`${authorName} <${authorEmail}>`);
  });

  test("should handle commit when there are no changes", async () => {
    // Try to commit without any changes
    const status = await $`git -C ${testDir} status --porcelain`.quiet();
    const hasChanges = status.stdout.toString().trim().length > 0;

    expect(hasChanges).toBe(false);
  });

  test("should create valid git history", async () => {
    // Create a commit to have more than one
    await Bun.write(diagramFile, "erDiagram\n  test {\n    id int PK\n  }\n");
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m "Add test diagram"`.quiet();

    // Get commit count
    const count = await $`git -C ${testDir} rev-list --count HEAD`.quiet();
    const commitCount = parseInt(count.stdout.toString().trim());

    // Should have 2 commits (initial + test)
    expect(commitCount).toBeGreaterThanOrEqual(2);
  });

  test("should verify diagram file exists in git", async () => {
    // First, commit a diagram file
    await Bun.write(diagramFile, "erDiagram\n  verified {\n    id int PK\n  }\n");
    await $`git -C ${testDir} add ${diagramFile.replace(testDir + '/', '')}`.quiet();
    await $`git -C ${testDir} commit -m "Add diagram for verification"`.quiet();

    // List files in git
    const files = await $`git -C ${testDir} ls-files`.quiet();
    const fileList = files.stdout.toString();

    expect(fileList).toContain("database-er-diagram.mmd");
  });
});
