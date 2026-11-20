window.__ModuleLoader__.load({
  id: '@local/dsh-mini',
  factory: (require) => {
    const React = require('react')

    /** Dictionary namespace owned by this plugin. */
    const NS = 'settings.dsh-mini'
    /** Must match the Host row's `endpoint`. */
    const ENDPOINT = '/plugins/dsh-mini'

    /**
     * The four kit sections this page absorbs, in the order the kit registered
     * them (21-24). Hiding a section never deletes it: the plugin row stays
     * active and its own route keeps answering, so this page is a second door
     * to the same state, not a replacement for the code behind it.
     */
    /** Route each absorbed page already serves; read, never copied. */
    const ROUTE_DESKTOP = '/plugins/agent-desktop'
    const ROUTE_BROWSER = '/plugins/browser-use'
    const ROUTE_AUTOMATION = '/plugins/auto-shutdown'
    /** Standing instructions, owned by dsh-session-instructions. */
    const ROUTE_INSTRUCTIONS = '/plugins/session-instructions'
    /** MiniMax credit proxy and the daily check-in panel. */
    const ROUTE_MINIMAX_CREDIT = '/plugins/minimax-credit/status'
    const ROUTE_MINIMAX_CHECKIN = '/plugins/minimax-checkin/status'

    /** English copy. */
    const en = {
      'nav': 'BornCode',
      'star.cta': 'Star',
      'star.title': 'Star this repository on GitHub',
      'title': 'BornCode',
      'intro': 'One page for the plugin kits: their update state, their health, the standing instructions, and the settings each kit used to keep on its own page. Every row below is still its own plugin with its own switch.',

      'tab.overview': 'Overview',
      'tab.updates': 'Updates',
      'tab.health': 'Health',
      'tab.customization': 'Instructions',
      'tab.desktop': 'Agent desktop',
      'tab.browser': 'Browser use',
      'tab.automation': 'Automation',
      'tab.minimax': 'MiniMax',
      'minimax.credits': 'Credits',
      'minimax.plan': 'Plan',
      'minimax.remaining': 'remaining',
      'minimax.token': 'Grant',
      'minimax.checkin': 'Daily check-in',
      'minimax.streak': 'Streak',
      'minimax.claim': 'Claim today',
      'minimax.claiming': 'Claiming…',
      'minimax.claimedToday': 'Already claimed today',
      'tab.supervisor': 'Supervisor',

      'check': 'Check for updates',
      'apply': 'Update now',
      'refresh': 'Refresh',
      'busy': 'Working…',
      'behind': '{count} commits behind {branch}',
      'current': 'Up to date',
      'ahead': '{count} local commits not pushed',
      'dirty': '{count} uncommitted changes',
      'never': 'Never',
      'checking': 'Checking…',
      'applying': 'Updating…',
      'noRepos': 'No checkout is configured for this row yet.',
      'noProbes': 'No health route is configured for this row yet.',
      'active': 'Running',
      'failed': 'Failed',
      'off': 'Turned off',
      'starting': 'Starting',
      'idle': 'Not loaded',
      'ok': 'Answering',
      'unreachable': 'Unreachable',
      'rows': 'Rows',
      'problems': 'Needs attention',
      'allGood': 'Every enabled row is running.',
      'lastCheck': 'Last check',
      'lastUpdate': 'Last update',
      'head': 'Current commit',
      'restartRequired': 'The files are installed but this host cannot swap them live. Restart the Harness to load the new code.',
      'pending': '{count} changed modules keep running their previous code until a restart.',
      'error': 'The last attempt failed',
      'phase': 'Phase',
      'row': 'Plugin',
      'verdict': 'State',
      'endpoint': 'Route',
      'attention': '{count} need attention',
      'clean': 'All clear',

      'endpointUnavailable': 'This plugin did not answer its own route. It is still installed; check the Health tab.',
      'loading': 'Loading…',
      'installed': 'Installed',
      'latest': 'Latest',
      'updateAvailable': 'Update available',
      'upToDate': 'Up to date',
      'enabled': 'Enabled',
      'autoUpdate': 'Update automatically',
      'disabled': 'Disabled',
      'platform': 'Platform',
      'tools': 'Tools',
      'noTools': 'None',
      'save': 'Save',
      'saving': 'Saving…',
      'saveFailed': 'The plugin did not accept that change',
      'instructions': 'Instructions',
      'instructions.description': 'Read first, before any work starts. Write here the deliverables that must not be forgotten — every request begins with them.',
      'instructions.placeholder': 'For example:\n- Deliver the final report as a PDF in the workspace.\n- Do not finish until the tests pass.\n- Always update the README.',
      'instructions.saving': 'Saving…',
      'instructions.saved': 'Saved. Every request now starts with these instructions.',
      'instructions.error': 'Could not save the instructions.',
      'instructions.empty': 'Nothing is set, so no instructions are added.',
      'instructions.hint': 'Ctrl+Enter saves.',
      'enable': 'Enable',
      'disable': 'Disable',
      'countdownRunning': 'A shutdown countdown is running for this conversation. Stop it by sending a message.',

      'delay': 'Countdown before shutdown',
      'seconds': 'seconds',
      'notSupported': 'Not supported on this platform',
      'na': '—',
    }

    /** Thai copy. */
    const th = {
      'nav': 'BornCode',
      'star.cta': 'กด Star',
      'star.title': 'กด Star ให้ repo นี้บน GitHub',
      'title': 'BornCode',
      'intro': 'หน้าเดียวสำหรับชุดปลั๊กอิน: สถานะอัปเดต สุขภาพ คำสั่งงาน และค่าที่แต่ละชุดเคยแยกหน้าไว้เอง ทุก row ข้างล่างยังเป็นปลั๊กอินของตัวเอง พร้อมสวิตช์ของตัวเอง',

      'tab.overview': 'ภาพรวม',
      'tab.updates': 'อัปเดต',
      'tab.health': 'สุขภาพ',
      'tab.customization': 'คำสั่งงาน',
      'tab.desktop': 'เอเจนต์เดสก์ท็อป',
      'tab.browser': 'บราวเซอร์',
      'tab.automation': 'ระบบอัตโนมัติ',
      'tab.minimax': 'MiniMax',
      'minimax.credits': 'เครดิต',
      'minimax.plan': 'แพ็กเกจ',
      'minimax.remaining': 'คงเหลือ',
      'minimax.token': 'โทเคน',
      'minimax.checkin': 'เช็คอินรายวัน',
      'minimax.streak': 'ต่อเนื่อง',
      'minimax.claim': 'รับวันนี้',
      'minimax.claiming': 'กำลังรับ…',
      'minimax.claimedToday': 'รับวันนี้แล้ว',
      'tab.supervisor': 'ตัวจัดการ',

      'check': 'ตรวจหาอัปเดต',
      'apply': 'อัปเดตเลย',
      'refresh': 'รีเฟรช',
      'busy': 'กำลังทำงาน…',
      'behind': 'ตามหลัง {branch} อยู่ {count} commits',
      'current': 'เป็นปัจจุบันแล้ว',
      'ahead': 'มี {count} commits ในเครื่องที่ยังไม่ push',
      'dirty': 'มีไฟล์แก้ค้าง {count} ไฟล์',
      'never': 'ยังไม่เคย',
      'checking': 'กำลังตรวจ…',
      'applying': 'กำลังอัปเดต…',
      'noRepos': 'row นี้ยังไม่ได้ตั้ง checkout',
      'noProbes': 'row นี้ยังไม่ได้ตั้งเส้นทางสุขภาพ',
      'active': 'ทำงานอยู่',
      'failed': 'พัง',
      'off': 'ปิดอยู่',
      'starting': 'กำลังเริ่ม',
      'idle': 'ยังไม่โหลด',
      'ok': 'ตอบสนอง',
      'unreachable': 'ติดต่อไม่ได้',
      'rows': 'จำนวน row',
      'problems': 'ต้องดู',
      'allGood': 'ทุก row ที่เปิดอยู่ทำงานปกติ',
      'lastCheck': 'ตรวจล่าสุด',
      'lastUpdate': 'อัปเดตล่าสุด',
      'head': 'commit ปัจจุบัน',
      'restartRequired': 'ไฟล์ติดตั้งแล้ว แต่ host นี้สลับโค้ดสดไม่ได้ ต้องรีสตาร์ท Harness เพื่อโหลดโค้ดใหม่',
      'pending': 'มี {count} โมดูลที่เปลี่ยนแล้วยังรันโค้ดเดิมจนกว่าจะรีสตาร์ท',
      'error': 'ครั้งล่าสุดไม่สำเร็จ',
      'phase': 'สถานะ fiber',
      'row': 'ปลั๊กอิน',
      'verdict': 'สภาพ',
      'endpoint': 'เส้นทาง',
      'attention': 'ต้องดู {count} รายการ',
      'clean': 'เรียบร้อยทั้งหมด',

      'endpointUnavailable': 'ปลั๊กอินนี้ไม่ตอบเส้นทางของตัวเอง ยังติดตั้งอยู่ — ดูที่แท็บสุขภาพ',
      'loading': 'กำลังโหลด…',
      'installed': 'ติดตั้งอยู่',
      'latest': 'ล่าสุด',
      'updateAvailable': 'มีอัปเดต',
      'upToDate': 'เป็นปัจจุบัน',
      'enabled': 'เปิดอยู่',
      'autoUpdate': 'อัปเดตอัตโนมัติ',
      'disabled': 'ปิดอยู่',
      'platform': 'แพลตฟอร์ม',
      'tools': 'เครื่องมือ',
      'noTools': 'ไม่มี',
      'save': 'บันทึก',
      'saving': 'กำลังบันทึก…',
      'saveFailed': 'ปลั๊กอินไม่รับการเปลี่ยนแปลงนี้',
      'instructions': 'คำสั่งงาน',
      'instructions.description': 'อ่านก่อนเริ่มงานทุกครั้ง เขียนสิ่งที่ต้องส่งมอบและห้ามลืมไว้ที่นี่ — ทุกคำขอจะเริ่มต้นด้วยข้อความนี้',
      'instructions.placeholder': 'ตัวอย่าง:\n- ส่งรายงานฉบับสุดท้ายเป็น PDF ใน workspace\n- อย่าจบงานจนกว่าเทสต์จะผ่าน\n- อัปเดต README ทุกครั้ง',
      'instructions.saving': 'กำลังบันทึก…',
      'instructions.saved': 'บันทึกแล้ว ทุกคำขอจะเริ่มต้นด้วยคำสั่งเหล่านี้',
      'instructions.error': 'บันทึกคำสั่งไม่สำเร็จ',
      'instructions.empty': 'ยังไม่ได้ตั้งคำสั่ง ระบบจะไม่เพิ่มข้อความใด ๆ',
      'instructions.hint': 'กด Ctrl+Enter เพื่อบันทึก',
      'enable': 'เปิด',
      'disable': 'ปิด',
      'countdownRunning': 'กำลังนับถอยหลังปิดเครื่องสำหรับบทสนทนานี้ ส่งข้อความเพื่อยกเลิก',

      'delay': 'นับถอยหลังก่อนปิดเครื่อง',
      'seconds': 'วินาที',
      'notSupported': 'แพลตฟอร์มนี้ไม่รองรับ',
      'na': '—',
    }

    /** Chinese copy. */
    const zh = {
      'nav': 'BornCode',
      'star.cta': '点个 Star',
      'star.title': '在 GitHub 上给本仓库点 Star',
      'title': 'BornCode',
      'intro': '插件套件的单一页面：更新状态、健康情况，以及各套件原先各自页面里的设置。下面每一行仍是独立插件，有自己的开关。',

      'tab.overview': '概览',
      'tab.updates': '更新',
      'tab.health': '健康',
      'tab.customization': '指令',
      'tab.desktop': '智能体桌面',
      'tab.browser': '浏览器',
      'tab.automation': '自动化',
      'tab.minimax': 'MiniMax',
      'minimax.credits': '额度',
      'minimax.plan': '套餐',
      'minimax.remaining': '剩余',
      'minimax.token': '授权',
      'minimax.checkin': '每日签到',
      'minimax.streak': '连续天数',
      'minimax.claim': '领取今日',
      'minimax.claiming': '领取中…',
      'minimax.claimedToday': '今日已领取',
      'tab.supervisor': '管家',

      'check': '检查更新',
      'apply': '立即更新',
      'refresh': '刷新',
      'busy': '处理中…',
      'behind': '落后 {branch} {count} 个提交',
      'current': '已是最新',
      'ahead': '{count} 个本地提交尚未推送',
      'dirty': '{count} 个文件未提交',
      'never': '从未',
      'checking': '检查中…',
      'applying': '更新中…',
      'noRepos': '此条目尚未配置检出。',
      'noProbes': '此条目尚未配置健康路由。',
      'active': '运行中',
      'failed': '失败',
      'off': '已关闭',
      'starting': '启动中',
      'idle': '未加载',
      'ok': '有响应',
      'unreachable': '无法访问',
      'rows': '条目数',
      'problems': '需要处理',
      'allGood': '所有启用的条目都在运行。',
      'lastCheck': '上次检查',
      'lastUpdate': '上次更新',
      'head': '当前提交',
      'restartRequired': '文件已安装，但此主机无法热替换，需要重启 Harness 才能加载新代码。',
      'pending': '{count} 个已更改的模块在重启前仍运行旧代码。',
      'error': '上次尝试失败',
      'phase': '阶段',
      'row': '插件',
      'verdict': '状态',
      'endpoint': '路由',
      'attention': '{count} 项需要处理',
      'clean': '一切正常',

      'endpointUnavailable': '该插件未响应自己的路由。它仍然安装着；请查看健康标签页。',
      'loading': '加载中…',
      'installed': '已安装',
      'latest': '最新',
      'updateAvailable': '有可用更新',
      'upToDate': '已是最新',
      'enabled': '已启用',
      'autoUpdate': '自动更新',
      'disabled': '已关闭',
      'platform': '平台',
      'tools': '工具',
      'noTools': '无',
      'save': '保存',
      'saving': '保存中…',
      'saveFailed': '插件未接受该更改',
      'instructions': '指令',
      'instructions.description': '开始任何工作前先阅读这些指令。在这里写下不能忘记的交付要求——每个请求都会以它们开头。',
      'instructions.placeholder': '例如：\n- 将最终报告以 PDF 形式交付到工作区。\n- 测试通过前不要结束。\n- 始终更新 README。',
      'instructions.saving': '保存中…',
      'instructions.saved': '已保存。每个请求现在都会以这些指令开头。',
      'instructions.error': '无法保存指令。',
      'instructions.empty': '尚未设置，系统不会添加任何内容。',
      'instructions.hint': 'Ctrl+Enter 保存。',
      'enable': '启用',
      'disable': '关闭',
      'countdownRunning': '此对话正在倒计时关机，发送消息即可取消。',

      'delay': '关机前倒数',
      'seconds': '秒',
      'notSupported': '此平台不支持',
      'na': '—',
    }

    /** The bound translator, replaced once the locale service is available. */
    let translate = (key, values) => {
      const template = en[key] ?? key
      if (values === undefined) return template
      return template.replace(/\{(\w+)\}/gu, (whole, name) =>
        values[name] === undefined ? whole : String(values[name]))
    }
    const t = (key, values) => translate(key, values)

    const SUCCESS = '#35c98a'
    const WARNING = '#e0a11b'
    const DANGER = '#e0523f'
    const IDLE = 'rgba(127,127,127,0.6)'

    const styles = {
      tabs: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' },
      tab: {
        padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', font: 'inherit',
        border: '1px solid transparent', background: 'transparent', color: 'inherit', opacity: 0.72,
      },
      tabActive: {
        padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', font: 'inherit',
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.3))',
        background: 'var(--dsh-accent, rgba(80,130,255,0.16))', color: 'inherit', opacity: 1,
      },
      card: {
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.25))',
        borderRadius: '10px', padding: '12px 14px', marginBottom: '10px',
      },
      rowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
      muted: { opacity: 0.7, fontSize: '0.9em' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85em' },
      dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', marginRight: '8px' },
      button: {
        padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', font: 'inherit',
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.35))',
        background: 'transparent', color: 'inherit',
      },
      buttonPrimary: {
        padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', font: 'inherit',
        border: '1px solid transparent', background: 'var(--dsh-accent, rgba(80,130,255,0.9))', color: '#fff',
      },
      input: {
        padding: '7px 9px', borderRadius: '7px', font: 'inherit', width: '100%', boxSizing: 'border-box',
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.35))',
        background: 'var(--dsh-input-bg, rgba(127,127,127,0.08))', color: 'inherit',
      },
      label: { display: 'block', marginBottom: '5px', fontSize: '0.9em', opacity: 0.85 },
    }

    const colourOf = verdict => verdict === 'ok' || verdict === 'active' ? SUCCESS
      : verdict === 'failed' ? DANGER
      : verdict === 'starting' ? WARNING
      : verdict === 'off' ? IDLE : WARNING

    /** Render a timestamp in the viewer's local time, or the never label. */
    const when = at => {
      if (at === 0 || at === undefined || at === null) return t('never')
      try { return new Date(at).toLocaleString() } catch { return t('never') }
    }

    /** Read one JSON route, tolerating absence without throwing at the caller. */
    const getJson = async path => {
      const response = await fetch(path, { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`${path} answered ${response.status}`)
      return await response.json()
    }

    /** POST one JSON body to a route. */
    const postJson = async (path, body) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error ? String(payload.error) : `status ${response.status}`)
      return payload
    }

    // ── shared pieces ──────────────────────────────────────────────────────

    const Field = ({ label, hint, children }) => React.createElement(
      'div',
      { style: { marginBottom: '12px' } },
      React.createElement('label', { style: styles.label }, label),
      children,
      hint ? React.createElement('div', { style: { ...styles.muted, marginTop: '4px' } }, hint) : null,
    )

    const Badge = ({ colour, text }) => React.createElement(
      'span',
      { style: { color: colour, whiteSpace: 'nowrap' } },
      React.createElement('span', { style: { ...styles.dot, background: colour } }),
      text,
    )

    /**
     * Render one absorbed plugin's route into the page.
     *
     * The absorbed pages are not copied: this reads the route the plugin
     * already serves, so the plugin keeps owning its own behaviour and this
     * page only changes where the numbers appear.
     */
    const AbsorbedPanel = ({ route, render }) => {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [tick, setTick] = React.useState(0)

      React.useEffect(() => {
        let live = true
        setError('')
        getJson(route)
          .then(payload => { if (live) setData(payload) })
          .catch(problem => {
            if (!live) return
            // A plugin that is off, restarting, or crashed keeps no answer on
            // its route. That is a Health-tab fact, not a broken settings page.
            setError(problem instanceof Error ? problem.message : String(problem))
          })
        return () => { live = false }
      }, [route, tick])

      if (error !== '') {
        return React.createElement(
          'div',
          { style: styles.card },
          React.createElement('div', { style: { color: WARNING } }, t('endpointUnavailable')),
          React.createElement('div', { style: { ...styles.mono, ...styles.muted, marginTop: '6px' } }, route),
          React.createElement('div', { style: { ...styles.muted, marginTop: '6px' } }, error),
          React.createElement('button', {
            style: { ...styles.button, marginTop: '10px' },
            onClick: () => setTick(value => value + 1),
          }, t('refresh')),
        )
      }
      if (data === null) {
        return React.createElement('div', { style: { ...styles.card, ...styles.muted } }, t('loading'))
      }
      return render(data, () => setTick(value => value + 1))
    }

    // ── tabs ───────────────────────────────────────────────────────────────

    const OverviewTab = ({ state, act, busy, error }) => {
      const doctor = state.doctor ?? {}
      const probes = state.probes ?? []
      const failing = (doctor.problems ?? []).length + probes.filter(probe => probe.ok !== true).length
      const behind = (state.repos ?? []).filter(repo => repo.behind > 0)
      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: styles.rowBetween, marginBottom: '10px' },
          React.createElement(
            'span',
            { style: { color: failing === 0 ? SUCCESS : WARNING } },
            failing === 0 ? t('clean') : t('attention', { count: failing }),
          ),
          React.createElement('span', { style: styles.muted }, `${t('lastCheck')}: ${when(state.checkedAt)}`),
        ),
        error !== '' ? React.createElement('div', { style: { color: DANGER, marginBottom: '10px' } }, `${t('error')}: ${error}`) : null,
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
          React.createElement('button', {
            style: styles.buttonPrimary, disabled: busy !== '',
            onClick: () => void act('check'),
          }, busy === 'check' ? t('busy') : t('check')),
          React.createElement('button', {
            style: styles.button, disabled: busy !== '' || behind.length === 0,
            onClick: () => void act('apply'),
          }, busy === 'apply' ? t('applying') : t('apply')),
        ),
        React.createElement('strong', { style: { display: 'block', marginBottom: '6px' } }, t('tab.updates')),
        (state.repos ?? []).map(repo => React.createElement(
          'div',
          { key: repo.id, style: styles.card },
          React.createElement(
            'div',
            { style: styles.rowBetween },
            React.createElement('strong', null, repo.label),
            repo.error !== ''
              ? React.createElement('span', { style: { color: DANGER } }, repo.error)
              : repo.behind > 0
                ? React.createElement('span', { style: { color: WARNING } }, t('behind', { count: repo.behind, branch: `${repo.remote}/${repo.branch}` }))
                : React.createElement('span', { style: { color: SUCCESS } }, t('current')),
          ),
          React.createElement('div', { style: { ...styles.muted, ...styles.mono, marginTop: '6px' } },
            `${repo.head || t('na')}  ${repo.subject || ''}`),
          repo.dirty > 0
            ? React.createElement('div', { style: { color: WARNING, ...styles.muted } }, t('dirty', { count: repo.dirty }))
            : null,
        )),
        React.createElement('strong', { style: { display: 'block', margin: '10px 0 6px' } }, t('tab.health')),
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement(
            'div',
            { style: styles.rowBetween },
            React.createElement('span', null,
              `${t('rows')}: ${doctor.total ?? 0} · ${t('active')}: ${doctor.active ?? 0}`
              + ` · ${t('failed')}: ${doctor.failed ?? 0} · ${t('off')}: ${doctor.off ?? 0}`),
            React.createElement(
              'span',
              { style: { color: (doctor.problems ?? []).length === 0 ? SUCCESS : WARNING } },
              (doctor.problems ?? []).length === 0 ? t('allGood') : t('attention', { count: (doctor.problems ?? []).length }),
            ),
          ),
        ),
      )
    }

    const UpdatesTab = ({ state, act, busy, error }) => {
      const reload = state.lastApply?.reload
      const restartRequired = typeof reload?.restartReason === 'string' && reload.restartReason !== ''
      const pending = Array.isArray(reload?.pending) ? reload.pending.length : 0
      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
          React.createElement('button', { style: styles.buttonPrimary, disabled: busy !== '', onClick: () => void act('check') },
            busy === 'check' ? t('busy') : t('check')),
          React.createElement('button', { style: styles.button, disabled: busy !== '', onClick: () => void act('apply') },
            busy === 'apply' ? t('applying') : t('apply')),
        ),
        error !== '' ? React.createElement('div', { style: { color: DANGER, marginBottom: '10px' } }, `${t('error')}: ${error}`) : null,
        restartRequired ? React.createElement('div', { style: { color: WARNING, marginBottom: '10px' } }, t('restartRequired')) : null,
        pending > 0 && !restartRequired
          ? React.createElement('div', { style: { color: WARNING, marginBottom: '10px' } }, t('pending', { count: pending }))
          : null,
        React.createElement('div', { style: { ...styles.muted, marginBottom: '8px' } },
          `${t('lastCheck')}: ${when(state.checkedAt)} · ${t('lastUpdate')}: ${when(state.updatedAt)}`),
        (state.repos ?? []).length === 0
          ? React.createElement('div', { style: { ...styles.card, ...styles.muted } }, t('noRepos'))
          : (state.repos ?? []).map(repo => React.createElement(
            'div',
            { key: repo.id, style: styles.card },
            React.createElement(
              'div',
              { style: styles.rowBetween },
              React.createElement('strong', null, repo.label),
              repo.error !== ''
                ? React.createElement('span', { style: { color: DANGER } }, repo.error)
                : repo.behind > 0
                  ? React.createElement('span', { style: { color: WARNING } }, t('behind', { count: repo.behind, branch: `${repo.remote}/${repo.branch}` }))
                  : React.createElement('span', { style: { color: SUCCESS } }, t('current')),
            ),
            React.createElement('div', { style: { ...styles.muted, ...styles.mono, marginTop: '6px' } }, repo.path),
            React.createElement('div', { style: { ...styles.muted, ...styles.mono } }, `${repo.head || t('na')}  ${repo.subject || ''}`),
            repo.updates.length > 0
              ? React.createElement('pre', {
                style: {
                  ...styles.mono, marginTop: '8px', maxHeight: '160px', overflow: 'auto',
                  background: 'rgba(127,127,127,0.08)', padding: '8px', borderRadius: '6px',
                },
              }, repo.updates.join('\n'))
              : null,
          )),
      )
    }

    const HealthTab = ({ state }) => {
      const doctor = state.doctor ?? {}
      const problems = doctor.problems ?? []
      const probes = state.probes ?? []
      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement(
            'div',
            { style: styles.rowBetween },
            React.createElement('strong', null, t('tab.health')),
            React.createElement('span', { style: styles.muted },
              `${t('rows')}: ${doctor.total ?? 0} · ${t('active')}: ${doctor.active ?? 0}`
              + ` · ${t('failed')}: ${doctor.failed ?? 0} · ${t('off')}: ${doctor.off ?? 0}`),
          ),
          doctor.rowsError
            ? React.createElement('div', { style: { color: DANGER, marginTop: '8px' } }, doctor.rowsError)
            : null,
          problems.length === 0
            ? React.createElement('div', { style: { color: SUCCESS, marginTop: '8px' } }, t('allGood'))
            : React.createElement(
              'div',
              { style: { marginTop: '8px' } },
              React.createElement('div', { style: { color: WARNING, marginBottom: '6px' } }, `${t('problems')} (${problems.length})`),
              ...problems.map(row => React.createElement(
                'div',
                { key: row.entryId, style: { padding: '5px 0', borderTop: '1px solid rgba(127,127,127,0.15)' } },
                React.createElement('span', { style: { ...styles.dot, background: colourOf(row.verdict) } }),
                React.createElement('span', { style: styles.mono }, row.moduleName || row.entryId),
                React.createElement('span', { style: { ...styles.muted, marginLeft: '8px' } },
                  `${t('phase')}: ${row.phase === null ? t('na') : row.phase}`),
                row.diagnostic !== ''
                  ? React.createElement('div', { style: { ...styles.muted, color: DANGER, marginLeft: '16px' } }, row.diagnostic)
                  : null,
              )),
            ),
        ),
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement('strong', null, t('endpoint')),
          probes.length === 0
            ? React.createElement('div', { style: { ...styles.muted, marginTop: '6px' } }, t('noProbes'))
            : React.createElement(
              'div',
              { style: { marginTop: '6px' } },
              ...probes.map(probe => React.createElement(
                'div',
                { key: probe.id, style: { ...styles.rowBetween, padding: '4px 0' } },
                React.createElement('span', null,
                  React.createElement('span', { style: { ...styles.dot, background: probe.ok ? SUCCESS : DANGER } }),
                  probe.label,
                  React.createElement('span', { style: { ...styles.muted, ...styles.mono, marginLeft: '8px' } }, probe.path)),
                React.createElement('span', { style: { ...styles.muted, color: probe.ok ? SUCCESS : DANGER } },
                  probe.ok ? `${t('ok')} · ${probe.status}` : (probe.error || t('unreachable'))),
              )),
            ),
        ),
      )
    }

    /**
     * Standing instructions.
     *
     * Owned by `dsh-session-instructions`, which ships in this same bundle. The
     * row used to register itself into `settings.general.item`, which made a
     * BornCode plugin show up inside DSH's own General page; it belongs beside
     * the rest of this bundle's settings instead.
     *
     * The textarea saves through that plugin's own route, so the plugin keeps
     * owning validation, the length cap and the persistence — this page only
     * changes where the field appears.
     */
    const InstructionsPanel = () => {
      const [value, setValue] = React.useState(null)
      const [status, setStatus] = React.useState('idle')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        let live = true
        getJson(ROUTE_INSTRUCTIONS)
          .then(body => {
            if (!live) return
            if (typeof body?.instructions === 'string') setValue(body.instructions)
            else setValue('')
          })
          .catch(problem => {
            if (!live) return
            // A missing route must not trap the user: the field stays editable
            // and the reason is shown, so nothing typed here is lost silently.
            setValue('')
            setError(problem instanceof Error ? problem.message : String(problem))
          })
        return () => { live = false }
      }, [])

      const save = async () => {
        if (busy || value === null) return
        setBusy(true)
        setStatus('saving')
        setError('')
        try {
          const body = await postJson(ROUTE_INSTRUCTIONS, { action: 'save', instructions: value })
          if (typeof body?.instructions === 'string') setValue(body.instructions)
          setStatus('saved')
        } catch (problem) {
          setStatus('error')
          setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          setBusy(false)
        }
      }

      if (value === null) {
        return React.createElement('div', { style: { ...styles.card, ...styles.muted } }, t('loading'))
      }

      const statusText = status === 'saving' ? t('instructions.saving')
        : status === 'saved' ? t('instructions.saved')
        : status === 'error' ? t('instructions.error')
        : value.trim() === '' ? t('instructions.empty')
        : t('instructions.hint')

      return React.createElement(
        'div',
        { style: styles.card },
        React.createElement(
          'div',
          { style: styles.rowBetween },
          React.createElement('strong', null, t('instructions')),
          React.createElement('span', { style: { ...styles.muted, ...styles.mono } }, ROUTE_INSTRUCTIONS),
        ),
        React.createElement('div', { style: { ...styles.muted, marginTop: '4px' } }, t('instructions.description')),
        React.createElement('textarea', {
          style: { ...styles.input, minHeight: '150px', maxHeight: '360px', resize: 'vertical', marginTop: '10px' },
          value,
          spellCheck: false,
          placeholder: t('instructions.placeholder'),
          'aria-label': t('instructions'),
          onChange: event => {
            setValue(event.target.value)
            if (status === 'saved' || status === 'error') setStatus('idle')
          },
          onKeyDown: event => {
            if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
            event.preventDefault()
            void save()
          },
        }),
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', flexWrap: 'wrap' } },
          React.createElement('button', {
            style: styles.buttonPrimary,
            disabled: busy,
            onClick: () => void save(),
          }, busy ? t('instructions.saving') : t('save')),
          React.createElement(
            'span',
            {
              role: 'status',
              style: {
                ...styles.muted,
                color: status === 'error' ? DANGER : status === 'saved' ? SUCCESS : undefined,
              },
            },
            statusText,
          ),
        ),
        error !== ''
          ? React.createElement('div', { style: { ...styles.muted, color: DANGER, marginTop: '6px' } }, error)
          : null,
      )
    }


    /** Agent desktop: install state and the update switch. */
    const DesktopTab = () => React.createElement(AbsorbedPanel, {
      route: ROUTE_DESKTOP,
      render: (data, refresh) => React.createElement(
        'div',
        { style: styles.card },
        React.createElement(
          'div',
          { style: styles.rowBetween },
          React.createElement('strong', null, t('tab.desktop')),
          React.createElement(Badge, {
            colour: data.installPath ? SUCCESS : WARNING,
            text: data.installedVersion ? `${t('installed')} ${data.installedVersion}` : t('notSupported'),
          }),
        ),
        data.updateAvailable === true
          ? React.createElement('div', { style: { color: WARNING, marginTop: '6px' } },
            `${t('updateAvailable')} → ${data.latestVersion ?? ''}`)
          : null,
        data.phase ? React.createElement('div', { style: { ...styles.muted, marginTop: '6px' } },
          `${t('phase')}: ${data.phase}`) : null,
        React.createElement('div', { style: { marginTop: '10px' } },
          React.createElement(Field, { label: t('autoUpdate') },
            React.createElement('button', {
              style: styles.button,
              onClick: async () => {
                try {
                  await postJson(ROUTE_DESKTOP, { action: 'set-auto-update', enabled: data.autoUpdate !== true })
                  refresh()
                } catch { /* reported by the plugin */ }
              },
            }, data.autoUpdate === true ? t('enabled') : t('disabled')))),
        Array.isArray(data.tools) && data.tools.length > 0
          ? React.createElement('div', { style: { ...styles.muted, ...styles.mono, marginTop: '8px' } }, data.tools.join(', '))
          : React.createElement('div', { style: { ...styles.muted, marginTop: '8px' } }, t('noTools')),
        data.lastError
          ? React.createElement('div', { style: { color: DANGER, marginTop: '6px' } }, String(data.lastError))
          : null,
      ),
    })

    /** Browser use: server state and the update switch. */
    const BrowserTab = () => React.createElement(AbsorbedPanel, {
      route: ROUTE_BROWSER,
      render: (data, refresh) => React.createElement(
        'div',
        { style: styles.card },
        React.createElement(
          'div',
          { style: styles.rowBetween },
          React.createElement('strong', null, t('tab.browser')),
          React.createElement(Badge, {
            colour: data.serverRunning === true ? SUCCESS : WARNING,
            text: data.serverRunning === true ? t('active') : t('idle'),
          }),
        ),
        data.installedVersion
          ? React.createElement('div', { style: { ...styles.muted, ...styles.mono, marginTop: '6px' } },
            `${t('installed')}: ${data.installedVersion}`)
          : null,
        data.updateAvailable === true
          ? React.createElement('div', { style: { color: WARNING, marginTop: '6px' } },
            `${t('updateAvailable')} → ${data.latestVersion ?? ''}`)
          : null,
        React.createElement('div', { style: { marginTop: '10px' } },
          React.createElement(Field, { label: t('autoUpdate') },
            React.createElement('button', {
              style: styles.button,
              onClick: async () => {
                try {
                  await postJson(ROUTE_BROWSER, { action: 'set-auto-update', enabled: data.autoUpdate !== true })
                  refresh()
                } catch { /* reported by the plugin */ }
              },
            }, data.autoUpdate === true ? t('enabled') : t('disabled')))),
        data.serverError
          ? React.createElement('div', { style: { color: DANGER, marginTop: '6px' } }, String(data.serverError))
          : null,
        Array.isArray(data.tools) && data.tools.length > 0
          ? React.createElement('div', { style: { ...styles.muted, ...styles.mono, marginTop: '8px' } }, data.tools.join(', '))
          : null,
      ),
    })

    /**
     * MiniMax: the credit balance and the daily check-in streak.
     *
     * Both routes are the ones the MiniMax rows already serve, so this tab is a
     * second door to the same state rather than a copy of it. The check-in is a
     * claim button only when the panel says something is claimable; otherwise
     * it reports the streak and stops, because a button that does nothing is
     * worse than no button.
     */
    const MinimaxTab = () => {
      const [credit, setCredit] = React.useState(null)
      const [checkin, setCheckin] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [tick, setTick] = React.useState(0)

      React.useEffect(() => {
        let live = true
        setError('')
        Promise.allSettled([getJson(ROUTE_MINIMAX_CREDIT), getJson(ROUTE_MINIMAX_CHECKIN)])
          .then(([creditResult, checkinResult]) => {
            if (!live) return
            if (creditResult.status === 'fulfilled') setCredit(creditResult.value)
            else setError(String(creditResult.reason?.message ?? creditResult.reason))
            if (checkinResult.status === 'fulfilled') setCheckin(checkinResult.value)
            else if (creditResult.status === 'fulfilled') setError(String(checkinResult.reason?.message ?? checkinResult.reason))
          })
        return () => { live = false }
      }, [tick])

      if (credit === null && checkin === null) {
        return React.createElement('div', { style: { ...styles.card, ...styles.muted } },
          error !== '' ? error : t('loading'))
      }

      const credits = credit?.credits ?? {}
      const plan = credits.plan ?? {}
      const token = credit?.token ?? {}
      const panel = checkin?.panel ?? {}
      const days = Array.isArray(panel.days) ? panel.days : []
      const canClaim = panel.claimedToday !== true && panel.claimable !== false

      const claim = async () => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await postJson(ROUTE_MINIMAX_CHECKIN.replace('/status', '/claim'), {})
          setTick(value => value + 1)
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          setBusy(false)
        }
      }

      return React.createElement(
        'div',
        null,
        error !== '' ? React.createElement('div', { style: { color: DANGER, marginBottom: '8px' } }, error) : null,
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement(
            'div',
            { style: styles.rowBetween },
            React.createElement('strong', null, t('minimax.credits')),
            React.createElement(Badge, {
              colour: credits.ok === true ? SUCCESS : WARNING,
              text: plan.hasTokenPlan === true ? `${t('minimax.plan')} ${plan.tier ?? ''}`.trim() : t('na'),
            }),
          ),
          React.createElement('div', { style: { ...styles.mono, marginTop: '8px', fontSize: '1.4em' } },
            `${credits.remaining ?? t('na')} ${t('minimax.remaining')}`),
          React.createElement('div', { style: { ...styles.muted, ...styles.mono, marginTop: '4px' } },
            credit?.proxy ?? ''),
          React.createElement('div', { style: { ...styles.muted, marginTop: '6px' } },
            `${t('minimax.token')}: ${token.ok === true ? t('ok') : t('na')}`
            + (token.expiresInMs ? ` · ${Math.round(token.expiresInMs / 3_600_000)}h` : '')),
        ),
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement(
            'div',
            { style: styles.rowBetween },
            React.createElement('strong', null, t('minimax.checkin')),
            React.createElement('span', { style: { color: SUCCESS } },
              `${t('minimax.streak')} ${panel.streak ?? 0}`),
          ),
          days.length > 0
            ? React.createElement(
              'div',
              { style: { display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' } },
              ...days.map(day => React.createElement(
                'div',
                {
                  key: day.dayNo,
                  style: {
                    flex: '1 1 40px', textAlign: 'center', padding: '6px 4px', borderRadius: '7px',
                    border: '1px solid var(--dsh-border, rgba(127,127,127,0.25))',
                    background: day.status === 3 ? 'color-mix(in srgb, #35c98a 16%, transparent)'
                      : day.isToday ? 'color-mix(in srgb, #e0a11b 16%, transparent)' : 'transparent',
                  },
                },
                React.createElement('div', { style: { ...styles.mono, fontSize: '0.75em', opacity: 0.7 } }, `D${day.dayNo}`),
                React.createElement('div', { style: { ...styles.mono, fontSize: '0.85em' } }, `+${day.points}`),
              )),
            )
            : null,
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' } },
            canClaim
              ? React.createElement('button', {
                style: styles.buttonPrimary, disabled: busy, onClick: () => void claim(),
              }, busy ? t('minimax.claiming') : t('minimax.claim'))
              : React.createElement('span', { style: { ...styles.muted, color: SUCCESS } }, t('minimax.claimedToday')),
          ),
        ),
      )
    }

    /**
     * Automation: the shutdown switch and its countdown.
     *
     * The switch is per Session: the plugin stores a choice keyed by the
     * conversation that armed it, and refuses a toggle without one. The route
     * accepts `?sessionId=` on the read, so this tab asks for the same session
     * it is toggling instead of inventing a global switch the plugin has not.
     */
    const AutomationTab = ({ sessionId }) => React.createElement(AbsorbedPanel, {
      route: sessionId ? `${ROUTE_AUTOMATION}?sessionId=${encodeURIComponent(sessionId)}` : ROUTE_AUTOMATION,
      render: (data, refresh) => {
        const armedHere = data.enabled === true
        return React.createElement(
          'div',
          { style: styles.card },
          React.createElement(
            'div',
            { style: styles.rowBetween },
            React.createElement('strong', null, t('tab.automation')),
            React.createElement(Badge, {
              colour: data.supported === false ? IDLE : (armedHere ? SUCCESS : IDLE),
              text: data.supported === false ? t('notSupported') : (armedHere ? t('enabled') : t('disabled')),
            }),
          ),
          data.supported === false
            ? null
            : React.createElement(
              'div',
              { style: { marginTop: '10px' } },
              React.createElement(Field, {
                label: t('delay'),
                hint: `${data.delaySeconds ?? 0} ${t('seconds')}`,
              }, React.createElement('input', {
                type: 'number',
                style: styles.input,
                defaultValue: data.delaySeconds ?? 60,
                onBlur: async event => {
                  const seconds = Number(event.target.value)
                  if (!Number.isFinite(seconds) || seconds < 0) return
                  try {
                    await postJson(ROUTE_AUTOMATION, { action: 'arm', sessionId, delaySeconds: seconds })
                    refresh()
                  } catch { /* reported by the plugin */ }
                },
              })),
              React.createElement('button', {
                style: styles.button,
                onClick: async () => {
                  try {
                    await postJson(ROUTE_AUTOMATION, { action: 'toggle', sessionId, enabled: !armedHere })
                    refresh()
                  } catch { /* reported by the plugin */ }
                },
              }, armedHere ? t('disable') : t('enable')),
              data.pendingHere === true
                ? React.createElement('div', { style: { color: WARNING, marginTop: '8px' } }, t('countdownRunning'))
                : null,
            ),
        )
      },
    })

    // ── the page ───────────────────────────────────────────────────────────

    const TABS = [
      { id: 'overview', label: 'tab.overview' },
      { id: 'updates', label: 'tab.updates' },
      { id: 'health', label: 'tab.health' },
      { id: 'customization', label: 'tab.customization' },
      { id: 'desktop', label: 'tab.desktop' },
      { id: 'browser', label: 'tab.browser' },
      { id: 'automation', label: 'tab.automation' },
      { id: 'minimax', label: 'tab.minimax' },
    ]

    /**
     * The page header: the BornCode mark, the title, and the Star call to
     * action.
     *
     * The mark is served by this bundle's own Host route, so it renders
     * offline and never depends on GitHub being reachable. Star opens the
     * canonical repository in a new tab; it is an ordinary link, not a button,
     * so the browser's own affordances and middle-click keep working.
     */
    const Header = () => React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: 0, marginBottom: '10px', flexWrap: 'wrap' } },
      React.createElement('img', {
        src: `${ENDPOINT}/logo.svg`,
        alt: '',
        'aria-hidden': 'true',
        style: { height: '30px', width: 'auto', flex: 'none' },
      }),
      React.createElement('h2', { style: { margin: 0 } }, t('title')),
      React.createElement(
        'a',
        {
          href: 'https://github.com/borncode-app/dsh-borncode',
          target: '_blank',
          rel: 'noreferrer noopener',
          title: `${t('star.title')} · https://github.com/borncode-app/dsh-borncode`,
          style: {
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '7px 15px', borderRadius: '999px', textDecoration: 'none',
            border: '1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #62A5DF) 55%, transparent)',
            background: 'linear-gradient(140deg, color-mix(in srgb, var(--dsw-alias-state-business-primary, #62A5DF) 16%, transparent), transparent 70%)',
            color: 'var(--dsw-alias-state-business-primary, #62A5DF)',
            fontWeight: 650, fontSize: '12.5px', whiteSpace: 'nowrap',
          },
        },
        React.createElement(
          'svg',
          { viewBox: '0 0 16 16', width: '13', height: '13', 'aria-hidden': 'true', style: { transition: 'transform .5s cubic-bezier(.34,1.56,.64,1)' } },
          React.createElement('path', {
            fill: 'currentColor',
            d: 'M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z',
          }),
        ),
        t('star.cta'),
      ),
    )

    const Supervisor = props => {
      // The settings shell mounts sections without a Session; the shutdown
      // switch is per conversation, so it is only honest when one is known.
      const sessionId = props?.sessionId
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [tab, setTab] = React.useState('overview')

      const load = React.useCallback(async () => {
        try {
          setState(await getJson(ENDPOINT))
          setError('')
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const act = async action => {
        setBusy(action)
        setError('')
        try {
          const body = await postJson(ENDPOINT, { action })
          setState(body)
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem))
        } finally {
          setBusy('')
        }
      }

      if (state === null) {
        return React.createElement('div', { style: styles.muted }, error !== '' ? error : t('loading'))
      }

      const body = tab === 'overview'
        ? React.createElement(OverviewTab, { state, act, busy, error })
        : tab === 'updates'
          ? React.createElement(UpdatesTab, { state, act, busy, error })
          : tab === 'health'
            ? React.createElement(HealthTab, { state })
            : tab === 'customization'
              ? React.createElement(InstructionsPanel)
              : tab === 'desktop'
                ? React.createElement(DesktopTab)
                : tab === 'browser'
                  ? React.createElement(BrowserTab)
                  : tab === 'automation'
                    ? React.createElement(AutomationTab, { sessionId })
                    : React.createElement(MinimaxTab)

      return React.createElement(
        'div',
        null,
        React.createElement(Header),
        React.createElement('p', { style: styles.muted }, t('intro')),
        React.createElement(
          'div',
          { style: styles.tabs, role: 'tablist' },
          ...TABS.map(entry => React.createElement(
            'button',
            {
              key: entry.id,
              role: 'tab',
              'aria-selected': tab === entry.id,
              style: tab === entry.id ? styles.tabActive : styles.tab,
              onClick: () => setTab(entry.id),
            },
            t(entry.label),
          )),
        ),
        body,
      )
    }

    const SectionIcon = () => React.createElement(
      'svg',
      { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      React.createElement('rect', { x: '3', y: '3', width: '7', height: '7', rx: '1.5' }),
      React.createElement('rect', { x: '14', y: '3', width: '7', height: '7', rx: '1.5' }),
      React.createElement('rect', { x: '3', y: '14', width: '7', height: '7', rx: '1.5' }),
      React.createElement('rect', { x: '14', y: '14', width: '7', height: '7', rx: '1.5' }),
    )

    /**
     * The four sections this page absorbs, with the exact locale namespace and
     * key each one builds its own nav label from. Reading the live label from
     * the locale service is what makes the match survive a language change: a
     * hardcoded "Agent desktop" would stop matching the moment the UI is Thai.
     */
    const ABSORBED_LABELS = [
      // `agent-customization` is hidden on the owner's instruction: its one
      // control is the deployment default model, which the owner does not use
      // and sets in the profile instead. Hidden means the page above is the
      // only entry, not that the setting stops working — the row stays active
      // and cordis.patch.yml still owns the value.
      { id: 'agent-customization', ns: 'settings.agentCustomization', key: 'agent.nav' },
      { id: 'agent-desktop', ns: 'settings.agent-desktop', key: 'nav' },
      { id: 'browser-use', ns: 'settings.browser-use', key: 'nav' },
      { id: 'automation', ns: 'settings.automation', key: 'nav' },
    ]

    /**
     * Hide the absorbed nav cells.
     *
     * The slot system has no unregister and the settings shell offers no
     * per-section visibility option, so a section that is registered is
     * rendered. This marks the rendered nav cell instead: the section keeps
     * running, its own route keeps answering, and its plugin row keeps its
     * switch — only the second navigation entry disappears, because the same
     * state is now reachable from this page.
     *
     * The match is by the cell's own label text, resolved through the locale
     * service rather than hardcoded, and re-resolved whenever the locale or the
     * nav re-renders. It degrades open: a cell that does not match stays
     * visible, so a DSH change that renames the wrapper can only bring the old
     * entries back, never hide the wrong one.
     *
     * @returns {() => void} disposer that unhides and stops observing.
     */
    const hideAbsorbedSections = locale => {
      /** Labels currently expected for the absorbed sections, normalized. */
      const wanted = () => {
        const labels = new Set()
        for (const entry of ABSORBED_LABELS) {
          try {
            const text = locale.bind(entry.ns)(entry.key)
            if (typeof text === 'string' && text.trim() !== '') labels.add(text.trim())
          } catch { /* the kit is not loaded: nothing of its own to hide */ }
        }
        return labels
      }

      const MARK = 'data-dsh-mini-hidden'
      const style = document.createElement('style')
      style.textContent = `[${MARK}="1"]{display:none !important}`
      document.head.appendChild(style)

      let observer = null
      let stopped = false

      const sweep = () => {
        if (stopped) return
        const labels = wanted()
        // Only the settings panel's own nav list is touched: matching every
        // button in the document could hide an unrelated control that happens
        // to share a word with a section label.
        const nav = document.querySelector('[class*="navList"]')
        if (nav === null) return
        for (const cell of nav.querySelectorAll('button')) {
          const text = (cell.textContent ?? '').trim()
          if (labels.has(text)) {
            if (cell.getAttribute(MARK) !== '1') cell.setAttribute(MARK, '1')
          } else if (cell.getAttribute(MARK) === '1') {
            // The locale changed, or the kit was reloaded with new copy: stop
            // hiding a cell this page no longer stands in for.
            cell.removeAttribute(MARK)
          }
        }
      }

      // The panel mounts on first open and re-renders on locale change, so the
      // sweep runs on both a subtree mutation and the locale subscription.
      const start = setTimeout(() => {
        if (stopped) return
        sweep()
        observer = new MutationObserver(() => sweep())
        observer.observe(document.body, { childList: true, subtree: true })
      }, 0)
      start.unref?.()
      const unsubscribe = typeof locale.subscribe === 'function' ? locale.subscribe(sweep) : () => {}

      return () => {
        stopped = true
        clearTimeout(start)
        unsubscribe()
        observer?.disconnect()
        for (const cell of document.querySelectorAll(`[${MARK}="1"]`)) cell.removeAttribute(MARK)
        style.remove()
      }
    }

    const apply = (ctx) => {
      const bound = ctx.locale.bind(NS)
      translate = (key, values) => bound(key, values)
      ctx.effect(() => ctx.locale.register(NS, { en, th, zh }), 'ui-dsh-mini: dictionaries')
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-mini',
        order: 21,
        label: () => bound('nav'),
        locale: NS,
      }, Supervisor))
      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: 'dsh-mini',
        order: 0,
        locale: NS,
      }, SectionIcon))
      // The absorbed sections keep running; only their duplicate nav entry is
      // removed, and the disposer restores it when this plugin unloads.
      ctx.effect(() => hideAbsorbedSections(ctx.locale), 'ui-dsh-mini: absorbed sections')
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
