window.__ModuleLoader__.load({
  id: '@local/dsh-auto-continue',
  factory: (require) => {
    const React = require('react')
    /** Must match the Host row's `endpoint`. */
    const ENDPOINT = '/plugins/auto-continue'
    /** How often the chip re-reads the Host state. */
    const POLL_MS = 10000
    /** How often a shown countdown re-renders. */
    const TICK_MS = 15000

    /** Visible text. Kept beside the exported locale resources for the same keys. */
    const dictionaries = {
      en: {
        'auto.title': 'Auto-continue',
        'auto.on': 'Auto: on',
        'auto.off': 'Auto: off',
        'auto.onHint': 'When a usage limit runs out, this conversation continues automatically once the limit resets. Click to turn it off.',
        'auto.offHint': 'This conversation stops when a usage limit runs out. Click to continue it automatically once the limit resets.',
        'auto.pendingIn': 'Continues in {time}',
        'auto.pendingTitle': 'Automatic continuation is booked. It resumes in {time} (attempt {attempt}). Click × to cancel.',
        'auto.cancel': 'Cancel the automatic continuation',
        'auto.unsupported': 'Automatic continuation needs the schedule service.',
        'auto.interval': 'Every {minutes}m',
        'auto.intervalAuto': 'Auto timing',
        'auto.intervalTitle': 'How often to try again after a usage limit. Click to change it.',
        'auto.intervalPrompt': 'Continue automatically every how many minutes? Enter 0 to let the plugin pick the reset time itself.',
        'auto.intervalInvalid': 'Enter a whole number of minutes, 0 or more.',
        'unit.h': '{count}h',
        'unit.m': '{count}m',
        'unit.s': '{count}s',
        'unit.gap': ' ',
      },
      th: {
        'auto.title': 'ต่ออัตโนมัติ',
        'auto.on': 'ต่ออัตโนมัติ: เปิด',
        'auto.off': 'ต่ออัตโนมัติ: ปิด',
        'auto.onHint': 'เมื่อโควตาการใช้งานหมด ระบบจะกลับมาต่อบทสนทนานี้ให้อัตโนมัติเมื่อโควตารีเซ็ต คลิกเพื่อปิด',
        'auto.offHint': 'เมื่อโควตาการใช้งานหมด บทสนทนาจะหยุดอยู่ คลิกเพื่อให้ต่ออัตโนมัติเมื่อโควตารีเซ็ต',
        'auto.pendingIn': 'จะต่อในอีก {time}',
        'auto.pendingTitle': 'ตั้งเวลาให้ต่ออัตโนมัติแล้ว จะเริ่มในอีก {time} (ครั้งที่ {attempt}) คลิก × เพื่อยกเลิก',
        'auto.cancel': 'ยกเลิกการต่ออัตโนมัติ',
        'auto.unsupported': 'การต่ออัตโนมัติต้องใช้บริการตั้งเวลา',
        'auto.interval': 'ทุก {minutes} น.',
        'auto.intervalAuto': 'เวลาอัตโนมัติ',
        'auto.intervalTitle': 'จะลองต่อใหม่ทุกกี่นาทีหลังโควตาหมด คลิกเพื่อเปลี่ยน',
        'auto.intervalPrompt': 'ให้ต่ออัตโนมัติทุกกี่นาที? ใส่ 0 เพื่อให้ plugin เลือกเวลารีเซ็ตเอง',
        'auto.intervalInvalid': 'ใส่จำนวนนาทีเป็นเลขเต็ม ตั้งแต่ 0 ขึ้นไป',
        'unit.h': '{count} ชม.',
        'unit.m': '{count} น.',
        'unit.s': '{count} ว.',
        'unit.gap': ' ',
      },
      zh: {
        'auto.title': '自动续接',
        'auto.on': '自动续接：开',
        'auto.off': '自动续接：关',
        'auto.onHint': '用量额度耗尽后，额度恢复时会自动继续本次对话。点击关闭。',
        'auto.offHint': '用量额度耗尽后对话会停止。点击开启：额度恢复后自动继续。',
        'auto.pendingIn': '将在 {time}后继续',
        'auto.pendingTitle': '已安排自动继续，将在 {time}后恢复（第 {attempt} 次）。点击 × 取消。',
        'auto.cancel': '取消自动续接',
        'auto.unsupported': '自动续接需要定时任务服务。',
        'auto.interval': '每 {minutes}分',
        'auto.intervalAuto': '自动计时',
        'auto.intervalTitle': '额度耗尽后每隔多少分钟重试。点击修改。',
        'auto.intervalPrompt': '每隔多少分钟自动继续？输入 0 由插件自行选择重置时间。',
        'auto.intervalInvalid': '请输入 0 或更大的整数分钟。',
        'unit.h': '{count}小时',
        'unit.m': '{count}分',
        'unit.s': '{count}秒',
        'unit.gap': '',
      },
    }

    /** The state route for one conversation; without an id it is the plain route. */
    function stateUrl(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return ENDPOINT
      return `${ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`
    }

    /** Fill `{name}` placeholders from one values object. */
    function format(text, values) {
      if (values === undefined) return text
      return text.replace(/\{(\w+)\}/gu, (match, name) => (values[name] === undefined ? match : String(values[name])))
    }

    const styles = {
      anchor: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        height: '20px',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: '12px',
        lineHeight: '20px',
        whiteSpace: 'nowrap',
      },
      button: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '20px',
        padding: '0 2px',
        margin: '0',
        border: 'none',
        background: 'none',
        color: 'inherit',
        font: 'inherit',
        fontSize: '12px',
        lineHeight: '20px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      cancel: {
        height: '16px',
        width: '16px',
        padding: '0',
        margin: '0 0 0 2px',
        border: 'none',
        borderRadius: '4px',
        background: 'none',
        color: 'inherit',
        font: 'inherit',
        fontSize: '12px',
        lineHeight: '16px',
        cursor: 'pointer',
        opacity: 0.7,
      },
      interval: {
        height: '20px',
        padding: '0 4px',
        margin: '0 0 0 2px',
        border: '1px solid currentColor',
        borderRadius: '10px',
        background: 'none',
        font: 'inherit',
        fontSize: '11px',
        lineHeight: '18px',
        cursor: 'pointer',
        opacity: 0.75,
        whiteSpace: 'nowrap',
      },
    }

    /** A clockwise arrow: the limit came back, so the work resumes. */
    function ContinueIcon() {
      return React.createElement(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
        React.createElement('path', {
          d: 'M20.5 12a8.5 8.5 0 1 1-2.5-6',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
        }),
        React.createElement('path', {
          d: 'M20.5 3.5v5h-5',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** A short reading of the time left, in the active language. */
    function durationText(milliseconds, t) {
      const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      if (hours > 0) {
        return `${t('unit.h', { count: hours })}${t('unit.gap')}${t('unit.m', { count: minutes })}`
      }
      if (minutes > 0) return t('unit.m', { count: minutes })
      return t('unit.s', { count: seconds })
    }

    const apply = (ctx) => {
      /** Translate through this plugin's own dictionaries, following the locale service. */
      const t = (key, values) => {
        let id = 'en'
        try {
          const snapshot = ctx.locale.getSnapshot()
          id = String(snapshot?.active ?? snapshot?.id ?? 'en')
        } catch {
          id = 'en'
        }
        const dict = dictionaries[id] ?? dictionaries[id.split('-')[0]] ?? dictionaries.en
        return format(dict[key] ?? dictionaries.en[key] ?? key, values)
      }

      /** The on/off control, with the booked continuation for this conversation. */
      function AutoContinueChip(props) {
        const sessionId = props.sessionId
        const [state, setState] = React.useState(undefined)
        const [busy, setBusy] = React.useState(false)
        const [, setTick] = React.useState(0)

        React.useEffect(() => {
          let cancelled = false
          let timer
          // A new conversation starts from its own reading, never the last one's.
          setState(undefined)
          const load = async () => {
            try {
              const response = await fetch(stateUrl(sessionId), { headers: { accept: 'application/json' } })
              const body = await response.json()
              if (!cancelled) setState(body)
            } catch {
              /* a transient failure keeps the previous reading */
            }
            if (!cancelled) timer = setTimeout(() => void load(), POLL_MS)
          }
          void load()
          return () => {
            cancelled = true
            clearTimeout(timer)
          }
        }, [sessionId])

        React.useEffect(() => {
          const handle = setInterval(() => setTick(value => value + 1), TICK_MS)
          return () => clearInterval(handle)
        }, [])

        /** Send one control action for this conversation and adopt the Host's answer. */
        const send = async (request) => {
          setBusy(true)
          try {
            const named = typeof sessionId === 'string' && sessionId.length > 0
            const response = await fetch(ENDPOINT, {
              method: 'POST',
              headers: { accept: 'application/json', 'content-type': 'application/json' },
              body: JSON.stringify(named ? { ...request, sessionId } : request),
            })
            setState(await response.json())
          } catch {
            /* leave the previous reading in place */
          } finally {
            setBusy(false)
          }
        }

        if (state === undefined) return null

        const mine = Array.isArray(state.pending) && sessionId !== undefined
          ? state.pending.find(entry => String(entry.sessionId) === String(sessionId))
          : undefined
        const remaining = mine === undefined ? 0 : mine.dueAt - Date.now()
        const waiting = mine !== undefined && remaining > 0
        const on = state.enabled === true
        // The cadence this conversation would book right now; `0` is adaptive.
        const minutes = typeof state.intervalMinutes === 'number' ? state.intervalMinutes : 0

        /** Ask the user for a cadence in minutes and store it for this conversation. */
        const editInterval = () => {
          const answer = window.prompt(t('auto.intervalPrompt'), String(minutes))
          if (answer === null) return
          const trimmed = answer.trim()
          const value = trimmed === '' ? 0 : Number(trimmed)
          if (!Number.isInteger(value) || value < 0) {
            window.alert(t('auto.intervalInvalid'))
            return
          }
          void send({ action: 'interval', minutes: value })
        }

        let label
        let title
        if (waiting) {
          label = t('auto.pendingIn', { time: durationText(remaining, t) })
          title = t('auto.pendingTitle', { time: durationText(remaining, t), attempt: mine.attempts })
        } else {
          label = t(on ? 'auto.on' : 'auto.off')
          title = state.supported === false ? t('auto.unsupported') : t(on ? 'auto.onHint' : 'auto.offHint')
        }

        const color = waiting
          ? 'var(--dsw-alias-state-warn-primary)'
          : on
            ? 'var(--dsw-alias-brand-primary)'
            : 'var(--dsw-alias-label-secondary)'

        return React.createElement(
          'span',
          { style: styles.anchor, 'data-composer-stat': 'auto-continue' },
          React.createElement(
            'button',
            {
              type: 'button',
              style: { ...styles.button, color, opacity: busy ? 0.6 : 1 },
              title,
              'aria-label': title,
              'aria-pressed': on,
              'data-auto-continue': waiting ? 'waiting' : on ? 'on' : 'off',
              disabled: busy,
              onClick: () => void send({ action: 'toggle' }),
            },
            React.createElement(ContinueIcon),
            React.createElement('span', null, label),
          ),
          waiting
            ? React.createElement(
              'button',
              {
                type: 'button',
                style: { ...styles.cancel, color },
                title: t('auto.cancel'),
                'aria-label': t('auto.cancel'),
                disabled: busy,
                onClick: () => void send({ action: 'cancel' }),
              },
              '×',
            )
            : null,
          on
            ? React.createElement(
              'button',
              {
                type: 'button',
                style: { ...styles.interval, color: 'var(--dsw-alias-label-secondary)' },
                title: t('auto.intervalTitle'),
                'aria-label': t('auto.intervalTitle'),
                'data-auto-interval': minutes > 0 ? String(minutes) : 'auto',
                disabled: busy,
                onClick: editInterval,
              },
              t(minutes > 0 ? 'auto.interval' : 'auto.intervalAuto', { minutes: String(minutes) }),
            )
            : null,
        )
      }

      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register({ name: 'conversation.composer.dock', id: 'auto-continue', order: 3 }, AutoContinueChip),
      )
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
