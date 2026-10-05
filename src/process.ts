import { existsSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { execa } from "execa";
import si from "systeminformation";

function normalizeProcName(name: string): string {
  return name.toLowerCase().replace(/\.exe$/i, "");
}

export function assertAbsoluteExe(exePath: string): void {
  if (!isAbsolute(exePath)) {
    throw new Error(`exePath must be an absolute path: ${exePath}`);
  }
}

export async function isProcessRunning(exePath: string): Promise<boolean> {
  return (await findPids(exePath)).length > 0;
}

export async function startProcess(exePath: string): Promise<void> {
  if (await isProcessRunning(exePath)) return;
  if (!existsSync(exePath)) {
    throw new Error(`Executable not found: ${exePath}`);
  }
  const subprocess = execa(exePath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  subprocess.nodeChildProcess.unref();
}

export async function closeProcess(exePath: string): Promise<void> {
  for (const pid of await findPids(exePath)) {
    try {
      process.kill(pid);
    } catch {
      // already exited
    }
  }
}

async function findPids(exePath: string): Promise<number[]> {
  const target = normalizeProcName(basename(exePath));
  const { list } = await si.processes();
  return list
    .filter((p) => normalizeProcName(p.name || "") === target)
    .map((p) => p.pid);
}
