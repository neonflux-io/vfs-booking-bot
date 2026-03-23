export interface MonitorConfig {
  id: string;
  destination: 'brazil' | 'portugal';
  visaType: string;
  intervalMs: number;
  profileIds: string[];
  mode: 'auto' | 'manual';
}

export interface MonitorState {
  config: MonitorConfig;
  isRunning: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  lastKnownSlots: Set<string>; // slot keys: "date:time"
  lastCheckedAt: Date | null;
  slotDetectedCount: number;
  lastHttpStatus?: number;
}

// In-memory map of active monitors
const monitors = new Map<string, MonitorState>();

export function setMonitor(id: string, state: MonitorState): void {
  monitors.set(id, state);
}

export function getMonitor(id: string): MonitorState | undefined {
  return monitors.get(id);
}

export function deleteMonitor(id: string): void {
  monitors.delete(id);
}

export function getAllMonitors(): MonitorState[] {
  return Array.from(monitors.values());
}
