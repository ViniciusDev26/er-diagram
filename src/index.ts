import * as core from "@actions/core";
import { run } from "./run.ts";

void run({
  cwd: process.cwd(),
  getInput: (name) => core.getInput(name),
  setOutput: (name, value) => core.setOutput(name, value),
  info: (message) => core.info(message),
  warning: (message) => core.warning(message),
  setFailed: (message) => core.setFailed(message),
});
