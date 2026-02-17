import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PluginSidecarSpec, PluginLogger } from "@talos/shared/types";
import { createLogger } from "../logger/index.js";

const execFileAsync = promisify(execFile);
const log = createLogger("sidecar");

const trackedContainers = new Set<string>();

function containerName(pluginId: string): string {
  return `talos-sidecar-${pluginId}`;
}

function imageName(pluginId: string): string {
  return `talos-sidecar-${pluginId}:latest`;
}

/**
 * Replaces {{credentials.xxx}} patterns in env values with actual credential values.
 */
export function interpolateEnv(
  envSpec: Record<string, string>,
  credentials: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(envSpec)) {
    result[key] = value.replace(/\{\{credentials\.(\w+)\}\}/g, (_match, credKey: string) => {
      return credentials[credKey] ?? "";
    });
  }
  return result;
}

/**
 * Checks if Docker is available on the system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the Docker image for a sidecar. Skips if already built.
 */
export async function buildSidecarImage(
  pluginId: string,
  pluginDir: string,
  sidecar: PluginSidecarSpec,
  pluginLog: PluginLogger,
): Promise<void> {
  const image = imageName(pluginId);

  // Check if image already exists
  try {
    const { stdout } = await execFileAsync("docker", ["images", "-q", image]);
    if (stdout.trim()) {
      pluginLog.debug(`Image ${image} already exists, skipping build`);
      return;
    }
  } catch {
    // If docker images fails, proceed to build anyway
  }

  pluginLog.info(`Building sidecar image ${image}...`);
  try {
    await execFileAsync(
      "docker",
      ["build", "-t", image, "-f", sidecar.dockerfile, "."],
      { cwd: pluginDir, timeout: 300_000 },
    );
    pluginLog.info(`Image ${image} built successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to build sidecar image for ${pluginId}: ${message}`);
  }
}

/**
 * Starts a sidecar container and waits for it to become healthy.
 */
export async function startSidecar(
  pluginId: string,
  _pluginDir: string,
  sidecar: PluginSidecarSpec,
  credentials: Record<string, string>,
  pluginLog: PluginLogger,
): Promise<void> {
  const name = containerName(pluginId);
  const image = imageName(pluginId);

  // Remove existing container if present (stopped or otherwise)
  try {
    await execFileAsync("docker", ["rm", "-f", name], { timeout: 15_000 });
  } catch {
    // Container may not exist — that's fine
  }

  // Build docker run args
  const args = ["run", "-d", "--name", name, "-p", `${sidecar.port}:${sidecar.port}`];

  // Add environment variables
  if (sidecar.env) {
    const interpolated = interpolateEnv(sidecar.env, credentials);
    for (const [key, value] of Object.entries(interpolated)) {
      args.push("--env", `${key}=${value}`);
    }
  }

  args.push(image);

  pluginLog.info(`Starting sidecar container ${name}...`);
  try {
    await execFileAsync("docker", args, { timeout: 30_000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to start sidecar container for ${pluginId}: ${message}`);
  }

  trackedContainers.add(name);

  // Health check polling
  if (sidecar.healthCheck) {
    const timeout = (sidecar.healthTimeout ?? 60) * 1000;
    const start = Date.now();
    const url = `http://localhost:${sidecar.port}${sidecar.healthCheck}`;

    pluginLog.info(`Waiting for sidecar health at ${url}...`);

    while (Date.now() - start < timeout) {
      try {
        // Any HTTP response (even 4xx) means the server is up and listening.
        // Connection errors (ECONNREFUSED) throw and indicate "not ready yet".
        await fetch(url, { signal: AbortSignal.timeout(5_000) });
        pluginLog.info(`Sidecar ${name} is healthy`);
        return;
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error(`Sidecar ${name} did not become healthy within ${sidecar.healthTimeout ?? 60}s`);
  }
}

/**
 * Stops and removes a sidecar container.
 */
export async function stopSidecar(pluginId: string, pluginLog: PluginLogger): Promise<void> {
  const name = containerName(pluginId);

  try {
    await execFileAsync("docker", ["stop", name], { timeout: 30_000 });
  } catch {
    // May already be stopped
  }

  try {
    await execFileAsync("docker", ["rm", "-f", name], { timeout: 15_000 });
  } catch {
    // May already be removed
  }

  trackedContainers.delete(name);
  pluginLog.info(`Sidecar ${name} stopped and removed`);
}

/**
 * Stops all tracked sidecar containers. Called during server shutdown.
 */
export async function stopAllSidecars(): Promise<void> {
  const names = [...trackedContainers];
  for (const name of names) {
    try {
      await execFileAsync("docker", ["stop", name], { timeout: 30_000 });
      await execFileAsync("docker", ["rm", "-f", name], { timeout: 15_000 });
      log.dev.debug(`Stopped sidecar: ${name}`);
    } catch {
      // Best effort
    }
    trackedContainers.delete(name);
  }
}
