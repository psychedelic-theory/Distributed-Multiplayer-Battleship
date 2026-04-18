// ==========================================================================
// Session — holds the active ApiClient and coordinates polling loops
// ==========================================================================

import { ApiClient } from '../api/client.js';

let client = null;
let pollTimer = null;
let pollAbort = false;

export const session = {
  /** Get or create the ApiClient for a given base URL. */
  getClient(baseUrl) {
    if (!baseUrl) return null;
    if (!client || client.baseUrl !== baseUrl.replace(/\/+$/, '')) {
      client = new ApiClient(baseUrl);
    }
    return client;
  },

  /** Clear the current client. */
  clearClient() { client = null; },

  /**
   * Start a polling loop that invokes `fn` every `intervalMs`.
   * `fn` may return a promise. Errors are caught and logged, never interrupt the loop.
   * Automatically stops any existing loop.
   */
  startPolling(fn, intervalMs) {
    this.stopPolling();
    pollAbort = false;

    const tick = async () => {
      if (pollAbort) return;
      try { await fn(); }
      catch (err) { console.warn('[session] poll error:', err); }
      if (pollAbort) return;
      pollTimer = setTimeout(tick, intervalMs);
    };
    // Fire once immediately, then on interval.
    tick();
  },

  stopPolling() {
    pollAbort = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  },
};
