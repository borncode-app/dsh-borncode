<div align="center">
  <img src="icon.svg" alt="" width="72" height="72">
  <h1>dsh-model-workspace</h1>
  <p><b>A sidebars shortcut that opens Our Free Model's Model workspace in one click.</b></p>
  <p>
    <a href="https://github.com/borncode-app/dsh-borncode/releases"><img alt="release" src="https://img.shields.io/github/v/tag/borncode-app/dsh-borncode/dsh-model-workspace?style=flat-square&color=6C4BF6"></a>
    <img alt="license" src="https://img.shields.io/badge/license-MIT-3DA639?style=flat-square">
    <img alt="plugin" src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-6C4BF6?style=flat-square">
    <img alt="scope" src="https://img.shields.io/badge/scope-sidebar%20row-8957e5?style=flat-square">
  </p>
</div>

---

## What it does

Our Free Model's Model workspace (magpie) lives as one tab inside its own settings page, several clicks deep.
This plugin puts it in the sidebar's **More** menu: one row, one click, and the workspace is open.

## Features

- **One row in More** — registered on `sidebar.panellist.actions`, the same list that holds Plugins and
  Automation tasks.
- **Lands on the workspace tab** — Our Free Model seeds its active tab from `localStorage`, so the shortcut writes
  that key before the settings panel mounts. Both the key and the value come from Our Free Model's own source.
- **Two ways to open** — the layout service first, then the sidebar's own Settings trigger as a fallback, so the
  row still works when the panel key is unavailable.
- **Localized** — English, Thai, and Chinese in `locale/`.
- No HTTP route, no tools, no timers: the Host half exists only so the bundle row can mount.

## Requirements

| | |
|---|---|
| DeepSeek Harness | 0.2.x (Web GUI) |
| Runtime | Node 24, supplied by the Harness runtime |
| Platform | Windows, macOS, Linux |
| Our Free Model | installed and enabled — the row opens that plugin's page |

## Install

```bash
git clone https://github.com/borncode-app/dsh-borncode.git dsh-borncode
```

Then:

```
plugin_manager install_bundle target=C:\path\to\dsh-model-workspace
```

Restart once. The row appears at the bottom of the sidebar's **More** menu.

## How it works

1. The Client half registers one entry on the `sidebar.panellist.actions` slot.
2. A click writes `ofm.tab = workspace` to `localStorage`, so Our Free Model's next render starts on that tab.
3. The click then opens the settings panel — through the layout service, or through the sidebar's Settings
   trigger when that service is not available.
4. Our Free Model mounts, reads the stored tab, and shows the Model workspace.

The Host half is deliberately inert: this plugin only navigates, so a failure here cannot affect the page it
points at.

## Limitations

- The shortcut depends on Our Free Model's own `localStorage` key names. If that plugin renames `ofm.tab` or the
  `workspace` tab value, the row opens the settings page on whatever tab that plugin now considers first.
- The row opens the settings panel even when Our Free Model is not installed; in that case the section simply
  does not exist, so nothing is shown.

## Files

| file | role |
|---|---|
| `index.js` | Host row: inert, present only so the bundle row can mount |
| `client.js` | Client half: the More-menu row and the navigation |
| `cordis.patch.yml` | the bundle patch that inserts the row |
| `locale/{en,th,zh}.json` | plugin metadata strings |
| `icon.svg` | plugin icon |

## ภาษาไทย

ปลั๊กอินนี้เพิ่มแถว **Model workspace** ในเมนู **More** ของแถบข้าง คลิกครั้งเดียวแล้วเปิดหน้า Model workspace
(magpie) ของ Our Free Model ในหน้าตั้งค่าให้ทันที

- **เปิดตรงแท็บที่ต้องการ** — Our Free Model อ่านแท็บที่ใช้งานจาก `localStorage` ปลั๊กอินนี้จึงเขียนค่านั้นก่อน
  เปิดหน้าตั้งค่า เพื่อให้ลงที่แท็บ Model workspace ไม่ใช่แท็บแรก
- **มีทางสำรอง** — ถ้าบริการ layout ใช้ไม่ได้ จะคลิกปุ่ม Settings ของแถบข้างแทน
- ไม่มี route, ไม่มี tool, ไม่มี timer — ฝั่ง Host มีไว้เพียงให้แถวของ bundle mount ได้

## License

MIT — see [LICENSE](../LICENSE).
