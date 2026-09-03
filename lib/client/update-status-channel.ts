import { normalizeUnifiedUpdateStatus } from "@/lib/client/normalize-update-status";

export const UPDATE_STATUS_EVENT = "twstock:update-status";
export const UPDATE_STATUS_REFRESH_EVENT = "twstock:update-status-refresh";
export const UPDATE_STATUS_CACHE_KEY = "twstock:update-status:last-good:m8.10.22:v8";

const LEADER_KEY = "twstock:update-status:leader:m8.10.22:v6";
const CHANNEL_NAME = "twstock:update-status-channel:m8.10.22:v6";
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEASE_MS = 24_000;

type CachedStatus<T> = {
  savedAt: number;
  payload: T;
};

type LeaderLease = {
  owner: string;
  expiresAt: number;
};

type ChannelMessage =
  | { type: "status"; payload: unknown }
  | { type: "refresh" };

let channel: BroadcastChannel | null = null;
let channelInitialized = false;

function getChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  if (!channelInitialized) {
    channelInitialized = true;
    channel.addEventListener("message", (event: MessageEvent<ChannelMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "status") {
        window.dispatchEvent(new CustomEvent(UPDATE_STATUS_EVENT, { detail: message.payload }));
      } else if (message.type === "refresh") {
        window.dispatchEvent(new Event(UPDATE_STATUS_REFRESH_EVENT));
      }
    });
  }
  return channel;
}

export function createUpdateStatusTabId() {
  if (typeof window === "undefined") return "server";
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function saveLastGoodUpdateStatus<T>(payload: T) {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeUnifiedUpdateStatus(payload) as unknown as T;
    const cached: CachedStatus<T> = { savedAt: Date.now(), payload: normalized };
    window.localStorage.setItem(UPDATE_STATUS_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Status caching is best-effort only.
  }
}

export function readLastGoodUpdateStatus<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UPDATE_STATUS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedStatus<T>;
    if (!cached || typeof cached.savedAt !== "number" || !cached.payload) return null;
    if (Date.now() - cached.savedAt > MAX_CACHE_AGE_MS) {
      window.localStorage.removeItem(UPDATE_STATUS_CACHE_KEY);
      return null;
    }
    return normalizeUnifiedUpdateStatus(cached.payload) as unknown as T;
  } catch {
    return null;
  }
}

export function broadcastUpdateStatus<T>(payload: T) {
  if (typeof window === "undefined") return;
  const normalized = normalizeUnifiedUpdateStatus(payload) as unknown as T;
  window.dispatchEvent(new CustomEvent<T>(UPDATE_STATUS_EVENT, { detail: normalized }));
  try {
    getChannel()?.postMessage({ type: "status", payload: normalized } satisfies ChannelMessage);
  } catch {
    // Cross-tab relay is an optimization; same-tab events still work.
  }
}

export function requestUpdateStatusRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UPDATE_STATUS_REFRESH_EVENT));
  try {
    getChannel()?.postMessage({ type: "refresh" } satisfies ChannelMessage);
  } catch {
    // Best effort.
  }
}

export function claimUpdateStatusLeader(owner: string, leaseMs = DEFAULT_LEASE_MS) {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    const lease = raw ? (JSON.parse(raw) as LeaderLease) : null;
    if (lease && lease.owner !== owner && Number(lease.expiresAt) > now) return false;
    const next: LeaderLease = { owner, expiresAt: now + Math.max(10_000, leaseMs) };
    window.localStorage.setItem(LEADER_KEY, JSON.stringify(next));
    const verify = JSON.parse(window.localStorage.getItem(LEADER_KEY) ?? "null") as LeaderLease | null;
    return verify?.owner === owner;
  } catch {
    // If localStorage is unavailable, allow this tab to poll rather than losing status entirely.
    return true;
  }
}

export function renewUpdateStatusLeader(owner: string, leaseMs = DEFAULT_LEASE_MS) {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    const lease = raw ? (JSON.parse(raw) as LeaderLease) : null;
    if (!lease || lease.owner !== owner) return claimUpdateStatusLeader(owner, leaseMs);
    window.localStorage.setItem(LEADER_KEY, JSON.stringify({ owner, expiresAt: Date.now() + Math.max(10_000, leaseMs) } satisfies LeaderLease));
    return true;
  } catch {
    return true;
  }
}

export function releaseUpdateStatusLeader(owner: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    const lease = raw ? (JSON.parse(raw) as LeaderLease) : null;
    if (lease?.owner === owner) window.localStorage.removeItem(LEADER_KEY);
  } catch {
    // Best effort.
  }
}
