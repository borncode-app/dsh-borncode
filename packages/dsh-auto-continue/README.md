<div align="center">
  <img src="icon.svg" alt="" width="72" height="72">
  <h1>dsh-auto-continue</h1>
  <p><b>Your conversation resumes by itself once a spent usage limit resets.</b></p>
  <p>
    <a href="https://github.com/borncode-app/dsh-borncode/releases"><img alt="release" src="https://img.shields.io/github/v/tag/borncode-app/dsh-borncode/dsh-auto-continue?style=flat-square&color=6C4BF6"></a>
    <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-3DA639?style=flat-square"></a>
    <img alt="plugin" src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-6C4BF6?style=flat-square">
    <img alt="default" src="https://img.shields.io/badge/default-off-8957e5?style=flat-square">
  </p>
</div>

---

## What it does

Running out of model quota in the middle of a task means coming back later and typing "continue" — if you
remember, and if you are still at the keyboard. This plugin books a **durable scheduled message** at the exact
moment the limit resets, so the same conversation picks up where it stopped, on its own.

It ships **off**. Turning it on for a deployment is a deliberate choice, and the switch lives on the composer.

## Features

- **Knows when to wake up** — reads the reset time the quota plugin already probed for that provider, instead of
  guessing from the error text.
- **Durable, not a timer** — the continuation is a scheduled message, so closing the app, rebooting, or losing the
  session does not lose the wake-up.
- **Waits only when waiting helps** — `QUOTA`, `ACCOUNT_QUOTA`, and `RATE_LIMIT` trigger it; every other error
  falls through to the normal retry policy untouched.
- **Bounded** — `minWaitSeconds` / `maxWaitSeconds` skip wake-ups that are too soon to matter or too far out to be
  useful (a weekly window three days away is left to you).
- **Fixed cadence, if you want one** — set `intervalMinutes` (or click the badge on the chip) and every continuation
  waits exactly that many minutes, ignoring the reset time entirely.
- **Backoff + attempts** — repeated failures widen the wait and stop at `maxAttempts`.
- **Per-conversation** — the chip stores the runtime choice; nothing global changes.

## Requirements

| | |
|---|---|
| DeepSeek Harness | 0.2.x (Web GUI) |
| Runtime | Node 24, supplied by the Harness runtime |
| Optional | [`dsh-model-quota`](https://github.com/borncode-app/dsh-minimax-kit/packages/dsh-model-quota) — supplies the real reset time |

## Install

```bash
git clone https://github.com/borncode-app/dsh-borncode.git dsh-borncode
```

Then in DSH: **Plugins** → install the bundle from that directory, or:

```
plugin_manager install_bundle target=C:\path\to\dsh-auto-continue
```

Restart once, then switch it on for the conversations where it is appropriate.

## Configuration

| field | default | meaning |
|---|---|---|
| `endpoint` | `/plugins/auto-continue` | Path the composer chip posts to |
| `enabled` | `false` | Ship-off default; the chip stores a runtime override |
| `codes` | `QUOTA`, `ACCOUNT_QUOTA`, `RATE_LIMIT` | Error codes that are worth booking a wake-up for |
| `minWaitSeconds` | `60` | Shorter resets are retried normally instead |
| `maxWaitSeconds` | `604800` | Farther-out resets are left to the user |
| `baseWaitSeconds` | `300` | First wait when the reset time is unknown |
| `maxBackoffSeconds` | `3600` | Ceiling for the widened wait |
| `intervalMinutes` | `0` | Fixed cadence in minutes; `0` keeps the adaptive wait. The chip's badge overrides it per conversation |
| `maxAttempts` | `12` | Give up after this many continuations |
| `quotaEndpoint` | `/plugins/model-quota` | Where the reset time is read from |
| `probeTimeoutMs` | `8000` | How long that read may take |
| `debugTest` | `false` | `true` lets `POST {"action":"test"}` book a real continuation now |

## How it works

```
429 / quota error ──▶ is the code worth waiting for?
                          │ yes
                          ▼
             is a fixed cadence booked?
                     │              │ yes
                     │ no           ▼
                     │      wait exactly N minutes
                     ▼
            ask dsh-model-quota for the reset time
                          │
                          ▼
             book one durable scheduled message
                          │
                     (limit resets)
                          ▼
              the conversation continues itself
```

No polling and no in-memory timer: between the error and the reset, nothing of this plugin is running.

## Files

| file | role |
|---|---|
| `index.js` | host row: code matching, reset-time probe, booking, backoff |
| `client.js` | composer chip and its state |
| `cordis.patch.yml` | the bundle patch that inserts the row |
| `locale/{en,th,zh}.json` | UI strings |
| `icon.svg` | plugin icon |
| `test/` | the checks used while building it |

## ภาษาไทย

Plugin นี้แก้ปัญหา "โควตาหมดกลางงาน" — เมื่อเจอ error หมดโควตา (`QUOTA` / `ACCOUNT_QUOTA` / `RATE_LIMIT`)
มันจะ**จองข้อความแบบ scheduled** ไว้ที่เวลารีเซ็ตจริง (อ่านจาก plugin `dsh-model-quota`) พอถึงเวลาบทสนทนาก็
ไปต่อเองโดยไม่ต้องพิมพ์ "continue"

- เป็น **scheduled message** ไม่ใช่ timer ในหน่วยความจำ → ปิดแอป/รีบูตก็ยังไม่หาย
- ค่าเริ่มต้นคือ **ปิด** เปิดเป็นรายบทสนทนาจากชิปบนช่องพิมพ์
- มีขอบเขตเวลา (`minWaitSeconds` / `maxWaitSeconds`) และ backoff + จำนวนครั้งสูงสุดกันวนไม่จบ
- **ตั้งรอบเวลาเองได้** — ใส่ `intervalMinutes` (หรือคลิกป้ายบนชิป) เพื่อให้ต่อทุก N นาทีตามที่กำหนด
  โดยไม่สนใจเวลารีเซ็ตจริงของ provider; ค่า `0` = ปล่อยให้ plugin เลือกเวลารีเซ็ตเอง (ค่าเริ่มต้น)

## License

[MIT](LICENSE) © 2026 BornCode
