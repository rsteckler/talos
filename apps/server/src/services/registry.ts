const services = new Map<string, unknown>();

export function registerService(name: string, instance: unknown): void {
  services.set(name, instance);
}

export function getService<T>(name: string): T | undefined {
  return services.get(name) as T | undefined;
}

export function removeService(name: string): void {
  services.delete(name);
}
