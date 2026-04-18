// ==========================================================================
// Session — holds the active ApiClient and coordinates polling loops
// ==========================================================================

import { ApiClient } from '../api/client.js';

let client = null;
// Each polling loop has its own state object. `activeLoop` points to the
// currently-running loop (if any). Stragglers from a previous loop check
// their OWN state.aborted flag, so they can't accidentally kill a new loop
// that was started while they were in flight.
let activeLoop = null;

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
    console.log('[session] startPolling', new Error().stack.split('\n').slice(1, 4).join(' <- '));
    this.stopPolling();

    // Each loop owns its own state. Even if an old loop's async tick races
    // with this startPolling call, it checks its own `aborted` flag, not a
    // shared one — so it can't kill this new loop.
    const myLoop = { aborted: false, timer: null };
    activeLoop = myLoop;

    const tick = async () => {
      if (myLoop.aborted) return;
      try { await fn(); }
      catch (err) { console.warn('[session] poll error:', err); }
      if (myLoop.aborted) return;
      myLoop.timer = setTimeout(tick, intervalMs);
    };
    // Fire once immediately, then on interval.
    tick();
  },

  stopPolling() {
    if (activeLoop) {
      console.log('[session] stopPolling', new Error().stack.split('\n').slice(1, 4).join(' <- '));
      activeLoop.aborted = true;
      if (activeLoop.timer) {
        clearTimeout(activeLoop.timer);
        activeLoop.timer = null;
      }
      activeLoop = null;
    }
  },
};