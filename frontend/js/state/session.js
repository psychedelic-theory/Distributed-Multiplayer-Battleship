/**
 * session.js — Ambient singleton holding the active ApiClient + polling loop.
 *
 * One place to:
 *   - attach/detach an ApiClient when server URL changes
 *   - drive the polling loop during lobby/placement/game
 *   - surface transport errors into toasts
 */

import { ApiClient } from '../api/client.js';
import { store } from './store.js';

const POLL_INTERVALS = {
  lobby:     2500,  // list games refresh
  placement: 2000,  // waiting for opponents to place
  game:      1500,  // fast enough to feel live, light enough for grading
};

class Session {
  constructor() {
    this.client = null;
    this._pollHandle = null;
    this._pollKind = null;  // 'lobby' | 'placement' | 'game' | null
    this._tickFn = null;
  }

  attach(baseUrl) {
    this.client = new ApiClient(baseUrl);
    return this.client;
  }

  detach() {
    this.stopPolling();
    this.client = null;
  }

  /**
   * Start a polling loop. `kind` controls interval; `tickFn` is the async
   * function run each tick. It receives the current client.
   */
  startPolling(kind, tickFn) {
    this.stopPolling();
    if (!this.client) return;

    this._pollKind = kind;
    this._tickFn = tickFn;
    const interval = POLL_INTERVALS[kind] || 2000;

    const loop = async () => {
      if (this._pollKind !== kind) return; // stopped or switched
      try {
        await tickFn(this.client);
      } catch (err) {
        // Silent during polling — don't spam toasts on transient issues
        console.warn('[poll]', err.message);
      } finally {
        if (this._pollKind === kind) {
          this._pollHandle = setTimeout(loop, interval);
        }
      }
    };

    // Immediate first tick
    loop();
  }

  stopPolling() {
    if (this._pollHandle) clearTimeout(this._pollHandle);
    this._pollHandle = null;
    this._pollKind = null;
    this._tickFn = null;
  }
}

export const session = new Session();
