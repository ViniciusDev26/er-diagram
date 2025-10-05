import { $ } from "bun";

export interface GitCommitterConfig {
  files: string[];
  message: string;
  authorName: string;
  authorEmail: string;
}

export class GitCommitter {
  constructor(private config: GitCommitterConfig) {}

  async hasChanges(): Promise<boolean> {
    try {
      const result = await $`git status --porcelain ${this.config.files}`.quiet();
      return result.stdout.toString().trim().length > 0;
    } catch {
      return false;
    }
  }

  async commitAndPush(): Promise<void> {
    try {
      console.log("📝 Checking for changes...");

      const hasChanges = await this.hasChanges();

      if (!hasChanges) {
        console.log("✨ No changes detected, skipping commit");
        return;
      }

      console.log("🔧 Configuring git...");
      await this.configureGit();

      console.log("📦 Staging files...");
      await this.stageFiles();

      console.log("💾 Creating commit...");
      await this.createCommit();

      console.log("🚀 Pushing changes...");
      await this.push();

      console.log("✅ Changes committed and pushed successfully!");
    } catch (error) {
      console.error("❌ Error committing changes:", error);
      throw error;
    }
  }

  private async configureGit(): Promise<void> {
    await $`git config user.name ${this.config.authorName}`;
    await $`git config user.email ${this.config.authorEmail}`;
  }

  private async stageFiles(): Promise<void> {
    for (const file of this.config.files) {
      await $`git add ${file}`;
    }
  }

  private async createCommit(): Promise<void> {
    await $`git commit -m ${this.config.message}`;
  }

  private async push(): Promise<void> {
    await $`git push`;
  }
}
