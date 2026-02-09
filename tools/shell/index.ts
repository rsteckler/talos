import { exec } from "node:child_process";

const DEFAULT_TIMEOUT = 30_000;

interface ExecuteArgs {
  command: string;
  cwd?: string;
  timeout?: number;
}

async function execute(args: Record<string, unknown>): Promise<unknown> {
  const { command, cwd, timeout } = args as unknown as ExecuteArgs;

  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: cwd ?? process.cwd(),
        timeout: timeout ?? DEFAULT_TIMEOUT,
        maxBuffer: 1024 * 1024, // 1 MB
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: error?.code ?? 0,
        });
      },
    );
  });
}

export const handlers = { execute };
