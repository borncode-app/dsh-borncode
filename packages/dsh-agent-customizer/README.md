<div align="center">
  <img src="icon.svg" alt="" width="72" height="72">
  <h1>dsh-agent-customizer</h1>
  <p><b>Per-agent instructions and a deployment default model, editable from the Web GUI.</b></p>
  <p>
    <a href="https://github.com/borncode-app/dsh-borncode/releases"><img alt="release" src="https://img.shields.io/github/v/tag/borncode-app/dsh-borncode/dsh-agent-customizer?style=flat-square&color=6C4BF6"></a>
    <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-3DA639?style=flat-square"></a>
    <img alt="plugin" src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-6C4BF6?style=flat-square">
    <img alt="platform" src="https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-555?style=flat-square">
  </p>
</div>

---

## What it does

DeepSeek Harness lets you pick which agent answers a conversation. This plugin chooses the **default model**
for the deployment: the model every freshly created agent starts on, editable from one page.

The standing instructions that apply to *every* agent are not this plugin's business. They belong to
`dsh-session-instructions`, which contributes one set of instructions to every agent of the profile — so
you write them once, in *Settings → General → Instructions*, and never repeat them per agent.

Nothing is baked into the bundle. The selection lives in `state.json` next to the plugin, so a profile upgrade
(or a `git pull`) never wipes what you chose.

## Features

- **Deployment default model** — read and written from *Settings → Agent customization*, so the fallback model is not a YAML hunt.
- **Per-agent reasoning effort** — the effort travels with the model selection.
- **Survives upgrades** — the selection is persisted in the plugin's `state.json`, not in the profile's patch file.
- **Localized UI** — English, Thai, and Chinese strings shipped in `locale/`.
- No network calls, no credentials, no background timers.

## Requirements

| | |
|---|---|
| DeepSeek Harness | 0.2.x (Web GUI) |
| Runtime | Node 24, supplied by the Harness runtime — nothing to install |
| Platform | Windows, macOS, Linux |

## Install

Clone the repo anywhere stable, then install it as a bundle into your profile:

```bash
git clone https://github.com/borncode-app/dsh-borncode.git dsh-borncode
```

In DSH, open **Plugins** and install the bundle from that directory, or ask the agent:

```
plugin_manager install_bundle target=C:\path\to\dsh-agent-customizer
```

Restart once. The row appears as `agent-customizer`, and the profile keeps a `link:` reference to the directory,
so a later `git pull` updates the plugin in place.

## Configuration

The bundle's [`cordis.patch.yml`](cordis.patch.yml) inserts the host row. Override any field in your profile's
`cordis.patch.yml`:

| field | default | meaning |
|---|---|---|
| `endpoint` | `/plugins/agent-customizer` | Path the Web GUI reads and writes the model selection at |

## How it works

1. The host row registers a small HTTP endpoint on the Web GUI origin and loads `state.json`.
2. The client half (`client.js`) renders the model picker and PUTs the selection back.
3. On every turn, the deployment's default model is the one a freshly created agent starts on — and nothing else.

## Files

| file | role |
|---|---|
| `index.js` | host row: endpoint, persistence, the default-model selection |
| `client.js` | Web GUI page: the default-model control |
| `cordis.patch.yml` | the bundle patch that inserts the row |
| `locale/{en,th,zh}.json` | UI strings |
| `icon.svg` | plugin icon |
| `test/` | the checks used while building it |

## ภาษาไทย

Plugin นี้ให้คุณเลือก **โมเดลเริ่มต้นของ deployment** ได้จากหน้า Settings → Agent customization โดยตรง:

- **โมเดลเริ่มต้นของ deployment** — ตั้ง/แก้ได้จากหน้าเดียวกัน ไม่ต้องไปแก้ YAML
- ข้อความถูกเก็บใน `state.json` ของ plugin ไม่ใช่ใน patch ของโปรไฟล์ → อัปเกรด DSH หรือ `git pull` แล้วข้อความไม่หาย
- **คำสั่งงานที่ใช้กับทุก agent** อยู่ที่ Settings → ทั่วไป → คำสั่ง (ของ `dsh-session-instructions`) — เขียนครั้งเดียว ได้ทุกตัว ไม่ต้องไล่แก้ทีละ agent

ติดตั้ง: `git clone` แล้วสั่ง `plugin_manager install_bundle target=<path>` ใน DSH รีสตาร์ทหนึ่งครั้ง

## License

[MIT](LICENSE) © 2026 BornCode
