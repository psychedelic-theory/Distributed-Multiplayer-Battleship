// ==========================================================================
// Connect screen — base URL entry + probe + recent servers
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

export function render(mountEl) {
  let urlValue = '';
  let probing = false;
  let errorMsg = '';

  const rerender = () => mount(mountEl, build());

  async function doConnect(raw) {
    if (probing) return;
    errorMsg = '';
    const normalized = normalizeBaseUrl(raw);
    if (!normalized) {
      errorMsg = 'Please enter a server URL.';
      rerender();
      return;
    }

    probing = true;
    rerender();

    try {
      const client = session.getClient(normalized);
      await client.probe();

      store.addRecentServer(normalized);
      store.set({
        serverUrl: normalized,
        serverConnected: true,
        screen: 'lobby',
      });
      toast.success('Connected', normalized.replace(/^https?:\/\//, ''));
    } catch (err) {
      probing = false;
      errorMsg = err.message || 'Could not reach server.';
      session.clearClient();
      rerender();
    }
  }

  function build() {
    const { recentServers } = store.get();

    return h('div', { class: 'screen screen--narrow fade-in' },
      h('div', { class: 'connect-hero' },
        h('h1', {}, 'Battleship'),
        h('p', {}, 'Universal client. Point it at any Phase 1 compliant server and play.'),
      ),

      Card({
        variant: 'feature',
        class: 'connect-form',
        children: [
          h('div', { class: 'stack' },
            Field({
              label: 'Server URL',
              hint: 'e.g. http://localhost:5000',
              error: errorMsg,
              children: Input({
                value: urlValue,
                mono: true,
                placeholder: 'http://localhost:5000',
                autofocus: true,
                disabled: probing,
                onInput: v => { urlValue = v; },
                onEnter: v => doConnect(v),
              }),
            }),
            probing
              ? Loader({ label: 'Probing server…', center: true })
              : Button({
                  variant: 'primary',
                  size: 'lg',
                  block: true,
                  onClick: () => doConnect(urlValue),
                  children: 'Connect',
                }),
          ),

          recentServers && recentServers.length > 0 && h('div', { class: 'recent-servers' },
            h('h4', {}, 'Recent servers'),
            h('div', { class: 'recent-servers__list stagger' },
              ...recentServers.map(url =>
                h('div', {
                  class: 'recent-server',
                  onClick: () => {
                    urlValue = url;
                    doConnect(url);
                  },
                },
                  h('span', {}, url.replace(/^https?:\/\//, '')),
                  h('span', { style: { color: 'var(--color-text-mute)', fontSize: 'var(--fs-xs)' } }, '↵'),
                )
              ),
            ),
          ),
        ],
      }),
    );
  }

  rerender();
}
