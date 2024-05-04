import { spinner } from "@clack/prompts";
import fs from "node:fs/promises";
import path from "path";
import os from "node:os";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node/index.js";

const officialAppStoreDir = path.resolve(os.homedir(), ".umbrel-cli", "umbrel-apps");
await cloneOfficialAppStore(officialAppStoreDir);

export async function getAllOfficialAppStoreAppIds(): Promise<string[]> {
  const files = await fs.readdir(officialAppStoreDir, { withFileTypes: true });
  return files
    .filter((file) => file.isDirectory() && !file.name.startsWith("."))
    .map((file) => file.name);
}

async function getAllOfficialAppStorePorts(): Promise<number[]> {
  return [];
}

async function cloneOfficialAppStore(dir: string) {
  const s = spinner();
  s.start("Pulling the official Umbrel App Store from GitHub");
  await fs.mkdir(dir, { recursive: true });
  await git.clone({
    fs,
    http,
    dir,
    url: "https://github.com/getumbrel/umbrel-apps.git",
    depth: 1,
    singleBranch: true,
  });
  s.stop("Finished pulling the official Umbrel App Store");
}
