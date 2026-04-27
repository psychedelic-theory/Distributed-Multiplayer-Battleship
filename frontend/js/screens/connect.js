// ==========================================================================
// Connect screen — tiered server list with auto-connect on load.
//
// Server tiers:
//   1. DEFAULT_SERVER  — official server, auto-connected on first cold-boot
//   2. KNOWN_SERVERS   — hardcoded team servers, selectable but not default
//   3. Custom URL input — manual fallback at the bottom
//
// Auto-connect behaviour:
//   - On the very first mount (cold-boot), silently probe DEFAULT_SERVER.
//   - Success → proceed to lobby.
//   - Failure → show the server list with an error banner.
//   - On subsequent mounts (e.g. after disconnect) auto-connect does NOT
//     re-fire — the user sees the list immediately so they can choose freely.
// ==========================================================================

import { h, mount } from '../utils/dom.js';
import { store } from '../state/store.js';
import { session } from '../state/session.js';
import { normalizeBaseUrl } from '../utils/format.js';
import { toast } from '../utils/toast.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Field, Input } from '../../components/ui/Field.js';
import { Loader } from '../../components/ui/Loader.js';

// ---------------------------------------------------------------------------
// Server registry
// ---------------------------------------------------------------------------

const DEFAULT_SERVER = {
  name: 'Official server',
  url: 'https://p01--frontend--zm8jxh5c8bph.code.run',
  isDefault: true,
};

const KNOWN_SERVERS = [
  { name: 'Team0x00 — Shrayas Raju',                          url: 'https://battleship-server-18q1.onrender.com' },
  { name: 'Team0x01 — Max Koon & Parker Estes',              url: 'https://battleship.koon.us' },
  { name: 'Team0x02 — Mir Patel & St Angelo Davis',          url: 'https://finalproject-virusoutbreak-3bwa.onrender.com' },
  { name: 'Team0x03 — Anthony Martino & Ian Sincoff',        url: 'https://finalproject3750.onrender.com' },
  { name: 'Team0x04 — Evan Racz & Truc Le',                  url: 'https://webdevgroupproj.onrender.com' },
  { name: 'Team0x05 — Mason Price & Shihab Abdelrahim',      url: 'https://cpsc3720finalproject.onrender.com' },
  { name: 'Team0x06 — Jude Slade & Alex Lake',               url: 'https://three750final.onrender.com' },
  { name: 'Team0x07 — Owen Schuyler & Jennifer Johnson',     url: 'https://persistent-waters.onrender.com' },
  { name: 'Team0x08 — Nathan Kitchens & Johan Zapata',       url: 'https://p01--backend--zm8jxh5c8bph.code.run' },
  { name: 'Team0x09 — Taylor Carter & Kevin Murphy',         url: 'https://lightslategray-dogfish-869967.hostingersite.com' },
  { name: 'Team0x0A — Anabel Thompson & Gabriella Borjas',   url: 'https://battleship-1-qpm6.onrender.com' },
  { name: 'Team0x0B — Bryce Dickson & James Kluttz',         url: 'https://cpsc.loosesocket.com' },
  { name: 'Team0x0C — Aryan Kapoor & Roman Pasqualone',      url: 'https://battleship-advanced.onrender.com' },
  { name: 'Team0x0D — Pascual Sebastian & Tian Xue',         url: 'https://vibe-hunter.com/battleship' },
  { name: 'Team0x0E — Andrew Hwang & Jack Huber',            url: 'https://cpsc3750-battleshipproject.onrender.com' },
  { name: 'Team0x0F — Anthony Frialde & Christian Johnston', url: 'https://cpsc-3750-battleship-final-project-phase1.onrender.com' },
  { name: 'Team0x10 — Justin Hooker & Seth Stamper',         url: 'https://capstone3750-production.up.railway.app' },
  { name: 'Team0x11 — Ayden Sabol & Jade Ashley',            url: 'https://battleship-cpsc3750.onrender.com' },
  { name: 'Team0x12 — Jack Stivers & Shaun Whitt',           url: 'https://final-project-7xwd.onrender.com' },
];

// Normalize all URLs once at module load time.
[DEFAULT_SERVER, ...KNOWN_SERVERS].forEach(s => {
  s.url = normalizeBaseUrl(s.url);
});

// ---------------------------------------------------------------------------
// Module-level one-shot guard.
// Flipped to true after the first auto-connect attempt (success OR failure).
// Prevents re-firing when the user navigates back to this screen after a
// manual disconnect — on re-mount they see the list immediately and choose
// a server explicitly.
// ---------------------------------------------------------------------------
let autoConnectDone = false;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(mountEl) {
  let selectedUrl = DEFAULT_SERVER.url;
  let customValue = '';
  let probing = false;

  // Show the loading spinner only on the very first mount where we will
  // attempt auto-connect. On re-mounts (post-disconnect) skip straight to
  // the server list.
  let autoConnecting = !autoConnectDone;
  let autoConnectError = '';
  let customError = '';

  const rerender = () => mount(mountEl, build());

  // ---- Connection logic ----

  async function doConnect(rawUrl) {
    if (probing) return;
    customError = '';
    const normalized = normalizeBaseUrl(rawUrl);
    if (!normalized) {
      customError = 'Please enter a server URL.';
      rerender();
      return;
    }

    probing = true;
    selectedUrl = normalized;
    rerender();

    try {
      const client = session.getClient(normalized);
      await client.probe();
      store.set({ serverUrl: normalized, serverConnected: true, screen: 'lobby' });
      toast.success('Connected', normalized.replace(/^https?:\/\//, ''));
    } catch (err) {
      probing = false;
      customError = normalized === DEFAULT_SERVER.url
        ? ''
        : (err.message || 'Could not reach server.');
      rerender();
    }
  }

  // Runs at most once per page-load (guarded by autoConnectDone).
  async function autoConnect() {
    try {
      const client = session.getClient(DEFAULT_SERVER.url);
      await client.probe();
      autoConnectDone = true;
      store.set({
        serverUrl: DEFAULT_SERVER.url,
        serverConnected: true,
        screen: 'lobby',
      });
    } catch (_err) {
      autoConnectDone = true;
      autoConnecting = false;
      autoConnectError =
        'Could not reach the official server. Please choose a server below or enter a custom URL.';
      rerender();
    }
  }

  // ---- Row click ----
  function selectServer(url) {
    if (probing) return;
    selectedUrl = url;
    customValue = '';
    customError = '';
    rerender();
  }

  // ---- Build ----
  function build() {
    if (autoConnecting) {
      return h('div', { class: 'screen screen--narrow fade-in' },
        h('div', { class: 'connect-hero' },
          h('h1', {}, 'Battleship'),
          h('p', {}, 'Connecting to the official server…'),
        ),
        h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-6)' } },
          Loader({ label: 'Connecting…', center: true }),
        ),
      );
    }

    const allServers = [DEFAULT_SERVER, ...KNOWN_SERVERS];

    return h('div', { class: 'screen screen--narrow fade-in' },
      h('div', { class: 'connect-hero' },
        h('h1', {}, 'Battleship'),
        h('p', {}, 'Select a server to play on, or enter a custom URL below.'),
      ),

      // Error banner — only shown when auto-connect failed
      autoConnectError && h('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-4)',
          marginBottom: 'var(--sp-4)',
          background: 'rgba(230,51,61,0.08)',
          border: '1px solid rgba(230,51,61,0.3)',
          borderRadius: 'var(--r-md)',
          color: 'var(--brand-red-hi)',
          fontSize: 'var(--fs-sm)',
          lineHeight: '1.5',
        },
      },
        h('span', { style: { flexShrink: '0', marginTop: '1px' } }, '⚠'),
        h('span', {}, autoConnectError),
      ),

      Card({
        variant: 'feature',
        class: 'connect-form',
        children: h('div', { class: 'stack' },

          // ---- Server list ----
          h('div', { class: 'stack-sm' },
            h('div', {
              style: {
                fontSize: 'var(--fs-xs)',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-mute)',
                marginBottom: 'var(--sp-1)',
              },
            }, 'Available servers'),

            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              ...allServers.map(server => buildServerRow(server)),
            ),
          ),

          // ---- Divider ----
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              color: 'var(--color-text-mute)',
            },
          },
            h('div', { style: { flex: '1', height: '1px', background: 'var(--color-border)' } }),
            h('span', { style: { fontSize: 'var(--fs-xs)' } }, 'or enter a custom URL'),
            h('div', { style: { flex: '1', height: '1px', background: 'var(--color-border)' } }),
          ),

          // ---- Custom URL input ----
          Field({
            error: customError,
            children: Input({
              value: customValue,
              mono: true,
              placeholder: 'http://localhost:5000',
              disabled: probing,
              onInput: v => {
                customValue = v;
                if (v.trim()) selectedUrl = null;
                rerender();
              },
              onEnter: v => {
                if (v.trim()) doConnect(v);
              },
            }),
          }),

          // ---- Connect button ----
          probing
            ? Loader({ label: 'Connecting…', center: true })
            : Button({
                variant: 'primary',
                size: 'lg',
                block: true,
                disabled: !selectedUrl && !customValue.trim(),
                onClick: () => {
                  const target = customValue.trim() ? customValue : selectedUrl;
                  if (target) doConnect(target);
                },
                children: selectedUrl === DEFAULT_SERVER.url && !customValue.trim()
                  ? 'Connect to official server'
                  : 'Connect',
              }),
        ),
      }),
    );
  }

  function buildServerRow(server) {
    const isSelected = selectedUrl === server.url && !customValue.trim();
    const isDefault = server.isDefault;

    return h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: 'var(--r-md)',
        border: isSelected
          ? '1.5px solid rgba(56,199,192,0.7)'
          : '1px solid var(--color-border)',
        background: isSelected
          ? 'rgba(56,199,192,0.07)'
          : 'var(--color-surface)',
        cursor: probing ? 'not-allowed' : 'pointer',
        transition: 'all 120ms ease',
        opacity: probing && !isSelected ? '0.55' : '1',
      },
      onClick: () => selectServer(server.url),
    },
      h('div', {
        style: {
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          flexShrink: '0',
          background: isDefault ? 'var(--color-success)' : 'var(--navy-400)',
          boxShadow: isDefault ? '0 0 6px var(--color-success)' : 'none',
        },
      }),

      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', {
          style: {
            fontSize: 'var(--fs-sm)',
            fontWeight: '500',
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }, server.name),
        h('div', {
          style: {
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-mute)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }, server.url.replace(/^https?:\/\//, '')),
      ),

      isDefault
        ? h('span', {
            style: {
              fontSize: '10px',
              fontWeight: '500',
              padding: '2px 8px',
              borderRadius: 'var(--r-pill)',
              background: 'rgba(56,199,192,0.15)',
              color: 'var(--brand-teal-hi)',
              border: '1px solid rgba(56,199,192,0.3)',
              flexShrink: '0',
            },
          }, 'Default')
        : null,
    );
  }

  // Kick off auto-connect only on the very first page-load mount.
  rerender();
  if (!autoConnectDone) {
    autoConnect();
  }
}