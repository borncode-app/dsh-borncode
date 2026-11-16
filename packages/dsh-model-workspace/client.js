window.__ModuleLoader__.load({
  id: '@local/dsh-model-workspace',
  factory: (require) => {
    const React = require('react')

    /**
     * The Our Free Model settings section this shortcut opens.
     *
     * Our Free Model registers its page under this exact `settings.section` id,
     * and the settings shell hands every section an `openSection(id)` callback.
     */
    const SETTINGS_SECTION = 'our-free-model'

    /**
     * The localStorage key Our Free Model reads its active tab from.
     *
     * The Model workspace is one tab inside Our Free Model's own settings page,
     * not a separate route. Our Free Model seeds that tab from
     * `window.localStorage` when the page mounts, so writing the key before the
     * section opens is what makes the shortcut land on the workspace instead of
     * the first tab. Both the key and the value come from Our Free Model's own
     * source (`TAB_KEY` and `TABS`).
     */
    const TAB_KEY = 'ofm.tab'
    /** The tab value that selects the Model workspace. */
    const TAB_VALUE = 'workspace'

    /** Visible text, kept beside the exported locale resources for the same keys. */
    const dictionaries = {
      en: {
        'shortcut.title': 'Model workspace',
        'shortcut.hint': 'Open Our Free Model\u2019s Model workspace (magpie) in Settings.',
      },
      th: {
        'shortcut.title': 'Model workspace',
        'shortcut.hint': '\u0e40\u0e1b\u0e34\u0e14 Model workspace (magpie) \u0e02\u0e2d\u0e07 Our Free Model \u0e43\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32',
      },
      zh: {
        'shortcut.title': '\u6a21\u578b\u5de5\u4f5c\u53f0',
        'shortcut.hint': '\u5728\u8bbe\u7f6e\u4e2d\u6253\u5f00 Our Free Model \u7684\u6a21\u578b\u5de5\u4f5c\u53f0\uff08magpie\uff09\u3002',
      },
    }

    /**
     * Set Our Free Model's active tab before its settings page mounts.
     *
     * @returns {void}
     */
    function pointAtWorkspace() {
      try {
        window.localStorage?.setItem(TAB_KEY, TAB_VALUE)
      } catch {
        /* a refused storage write still leaves the panel opening */
      }
    }

    /** The caret that opens the settings panel, tried when the service is absent. */
    function settingsTrigger() {
      try {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
        return buttons.find(node => {
          const label = `${node.getAttribute('aria-label') ?? ''} ${node.textContent ?? ''}`.trim()
          return /^(settings|\u0e15\u0e31\u0e9b\u0e04\u0e48\u0e32|\u8bbe\u7f6e)$/iu.test(label)
        })
      } catch {
        return undefined
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        /**
         * Translate through the locale service, falling back to the inline copy.
         *
         * @param {string} key - the message key.
         * @returns {string} the translated text.
         */
        const t = (key) => {
          try {
            const text = ctx.locale.bind('model-workspace')(key)
            if (typeof text === 'string' && text.length > 0 && text !== key) return text
          } catch {
            /* the locale service is unavailable: use the inline copy */
          }
          let id = 'en'
          try {
            const snapshot = ctx.locale.getSnapshot()
            id = String(snapshot?.active ?? snapshot?.id ?? 'en')
          } catch {
            id = 'en'
          }
          const dict = dictionaries[id] ?? dictionaries[id.split('-')[0]] ?? dictionaries.en
          return dict[key] ?? dictionaries.en[key] ?? key
        }

        /**
         * Open Our Free Model's settings page on its Model workspace tab.
         *
         * Two ways in, in order of reliability:
         *
         *   1. The settings shell publishes `openSection` to every
         *      `settings.section`, but this plugin is not a section, so it
         *      reaches the panel through the layout service instead.
         *   2. When no layout service answers, the sidebar's own Settings
         *      trigger is clicked, which the shell always renders.
         *
         * The stored tab has to be in place first: Our Free Model seeds its
         * active tab during its first render.
         *
         * @returns {void}
         */
        const openWorkspace = () => {
          pointAtWorkspace()
          let opened = false
          try {
            ctx.layout?.selectPanel?.(SETTINGS_SECTION)
            opened = true
          } catch {
            /* the panel key is unknown here: fall back to the sidebar trigger */
          }
          if (opened) return
          const trigger = settingsTrigger()
          if (trigger !== undefined) {
            try {
              trigger.click()
              return
            } catch {
              /* fall through to the keyboard path */
            }
          }
          // Last resort: the sidebar footer's Settings row is reachable through
          // the same layout service as a toggle, which at least surfaces the panel.
          try {
            ctx.layout?.toggleSidebar?.()
          } catch {
            /* nothing else can be done from this view */
          }
        }

        /** One row in the sidebar's More menu. */
        function ShortcutRow() {
          const [hover, setHover] = React.useState(false)
          return React.createElement(
            'button',
            {
              type: 'button',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                borderRadius: '8px',
                background: hover ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                color: 'var(--dsw-alias-label-primary)',
                font: 'inherit',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
              },
              title: t('shortcut.hint'),
              'aria-label': t('shortcut.title'),
              onClick: openWorkspace,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
            },
            React.createElement(
              'span',
              { 'aria-hidden': 'true', style: { display: 'inline-flex', width: '16px', height: '16px' } },
              React.createElement(
                'svg',
                {
                  width: '16',
                  height: '16',
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '1.5',
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                },
                React.createElement('rect', { x: '2', y: '2.5', width: '12', height: '11', rx: '2' }),
                React.createElement('path', { d: 'M2 6h12' }),
                React.createElement('path', { d: 'M6 6v7.5' }),
              ),
            ),
            React.createElement('span', null, t('shortcut.title')),
          )
        }

        ctx.locale.register('model-workspace', dictionaries)

        ctx.slots.inject('sidebar.panellist.actions', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist.actions', id: 'model-workspace', order: 40, label: () => t('shortcut.title') },
            ShortcutRow,
          ),
        )
      },
    }
  },
})
