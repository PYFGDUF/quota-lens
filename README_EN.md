<p align="center">
  <img src="assets/readme/hero.svg" alt="Quota Lens - Antigravity UI Extension" width="100%" />
</p>

<p align="center">
  <strong>Native Conversation Quota & Token Consumption Tracker for Google Antigravity</strong><br>
  Monitor turn-by-turn quota usage (5-hour & weekly limit %) for every single interaction, alongside global quota health and live refresh countdowns.
</p>

<p align="center">
  <a href="README.md"><b>简体中文</b></a> &nbsp;|&nbsp; <a href="README_EN.md"><b>English</b></a>
</p>

---

## Why Quota Lens?

When pair programming with AI in Antigravity, developers often experience quota depletion abruptly without knowing how much quota each complex code generation or refactoring prompt actually consumed.

| Dimension | Default Workflow (No Tracking) | With Quota Lens |
| :--- | :--- | :--- |
| **Per-Turn Cost** | Completely unknown until an unexpected rate limit popup | Real-time 5h & weekly quota deductions for the immediate prompt |
| **Token Attribution** | Cannot measure prompt cache hits vs output token costs | Automatic breakdown of Input / Output / Cache ratio with weighted cost |
| **Multi-Model Tracking** | Hard to tell whether Gemini or 3P models burned more quota | Instant toggle between Gemini and Claude & GPT 3P groups |
| **Renewal Estimation** | Vague timestamps that make planning sessions difficult | Millisecond-level countdown timers to exact full reset times |
| **System Overhead** | Heavy proxy agents or external database setups | **Zero external npm dependencies**, ultra-lightweight Node sidecar |

---

## Key Features

- **Turn-by-Turn Quota Attribution (Core)**
  - Defines each interaction turn strictly as "One User Prompt -> Completed Agent Response".
  - Displays the quota consumed specifically by the **most recent turn** (e.g., `5h: -0.20% | Weekly: -0.05%`).
  - Provides an interactive turns history breakdown with prompt snippets, token cost weights, and step durations.

- **Dual Model Group Tracking**
  - Native support for both **Gemini Models** (Flash / Pro) and **Claude & GPT 3P Models**.
  - Switch smoothly between model group views to understand consumption patterns across different engines.

- **Dynamic Countdowns & Global Quota Health**
  - Live observation of official Language Server buckets (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`).
  - Computes exact remaining duration until full renewal with a second-by-second countdown ticker.

- **Task Planning Quota Prediction & Dynamic Scaling (quota-planner Skill)**
  - Ships with native Antigravity skill `quota-planner`, deeply integrating into the `/plan` workflow.
  - Automatically invokes `check_quota.mjs` to probe live balances, estimating task consumption based on the 4.0000 Invariance Law.
  - Pre-emptively warns users when quota is constrained, offering three dynamic scale adjustment strategies (Full, Phased MVP, or Lean Mode).

- **Restrained IDE-Native Aesthetics & Bilingual i18n**
  - Designed with low-saturation palette and pure SVG vector icons, **zero emoji clutter**.
  - Seamless toggle between `en-US` and `zh-CN` across all UI labels, cards, countdowns, and dialogs.

---

## Architecture & How It Works

<p align="center">
  <img src="assets/readme/architecture.svg" alt="Quota Lens System Architecture" width="100%" />
</p>

### 1. Direct Language Server RPC
Quota Lens requires no proxy or packet sniffers. Its sidecar directly queries the local Antigravity Language Server ConnectRPC service:
```text
POST http://${ANTIGRAVITY_LS_ADDRESS}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary
Headers: x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}
```

### 2. Dynamic Baseline Differential
- **Session Baseline**: Captures an initial snapshot $B = (B_{5h}, B_{weekly})$ when the session starts;
- **Live Differential**: Compares ongoing live quota $C = (C_{5h}, C_{weekly})$ to calculate cumulative session consumption $\Delta = (B - C) \times 100\%$;
- **Reset Awareness**: Detects whenever $C > B$ (quota renewed) and supports one-click "Reset Base" to restart tracking from any moment.

### 3. Empirical Finding: The 4.0000 Periodic Rule
Empirically verified across multiple production turns:
$$\frac{\Delta 5\text{h}}{\Delta \text{Weekly}} \equiv 4.0000$$
Your weekly quota capacity is numerically equivalent to exactly **four 5-hour burst refresh windows**.

### 4. Subagent Deep Tracking & Collapsible Drawer
- **Parent-Child Correlation**: Automatically detects turns that spawn subagents (`invoke_subagent`), pairing them with respective `conversationId` and role configurations;
- **Independent Log Parsing**: Traverses subagent logs to inspect Role, Model, Step count, Duration, and Tokens (Input / Output / Cache);
- **Granular Attributed Quota**: Applies calibrated physics formulas to calculate independent 5-hour and weekly quota for each individual subagent;
- **Interactive Drawer UI**: Embeds collapsible subagent trays inside turn cards, alongside a main vs. subagent summary in the session card.

### 5. Multi-Group Engine & Claude / GPT Group Notice
Quota Lens supports real-time observation of both the **Gemini Models Group** and the **Claude & GPT Models Group**, automatically attributing token consumption based on the active model of each interaction.

All quota physics models, weighting constants, and capacity denominators in this extension are empirically derived and calibrated on a **Gemini Pro (Powered By Jio)** subscription environment.

> [!WARNING]
> **Important Notice on Accuracy for Claude & GPT Model Group Usage Detection**
> 
> - **Subscription Baseline**: All quota calculations are calibrated based on **Gemini Pro (Powered By Jio)**. Quota pool sizes and refresh policies may vary across other subscription channels (such as Google One AI Premium or Google Workspace enterprise tiers).
> - **Gemini Models Group**: Rigorously calibrated across hundreds of real turns against language server buckets; weighted token formulas (3x output, 0.05x cache read, 280,000 capacity denominator per 1%) provide high fidelity.
> - **Claude & GPT Models Group**: Third-party models are calibrated against Claude official API pricing ratios (5x output weight, 0.1x cache read weight) with an empirical full-range stress test (94.7% consumption span, 2,400 units per 1%), discovering an exact **2.0000 periodic rule** ($\frac{\Delta 5\text{h}}{\Delta \text{Weekly}} \equiv 2.0000$).
> - **Accuracy Caveat**: Google backend third-party quota pools, account tiers, and asynchronous batching policies vary. **Figures for the Claude & GPT group serve as helpful trend and relative usage estimators; authoritative remaining allowances remain those reported by Google's official language server**.

---

## Installation & Quickstart

### Option 1: Clone into Plugins Directory (Recommended)

Run the following command in your terminal:

```bash
git clone https://github.com/PYFGDUF/quota-lens.git ~/.gemini/config/plugins/quota-lens
```

### Option 2: Symbolic Link (For Local Development)

If you already have the repository in your local workspace:

```bash
ln -s "$(pwd)" ~/.gemini/config/plugins/quota-lens
```

---

## Enabling & Opening the Extension

1. **Enable the Plugin**:
   - Open the Antigravity desktop app;
   - Click the **Customizations** icon at the bottom of the left sidebar;
   - Under the **Installed** tab, find **Quota Lens** and toggle it **Enabled**.

2. **Open the Side Pane**:
   - Open any active chat conversation;
   - Click the **⋮ (three dots menu)** in the top right corner;
   - Select **Extensions** -> **Quota Lens**;
   - The auxiliary side pane will open and begin live tracking!

---

## Custom Configuration: Adapting Other Membership Plans (Google One / Workspace)

The built-in empirical constants and physical denominators of this extension are calibrated for the **Gemini Pro (Powered By Jio)** subscription. If you are using another membership tier (such as **Google One AI Premium**, **Google Workspace Business/Enterprise**, or organizational enterprise tiers), your available quota pool capacity may differ.

You can easily calibrate and configure your own custom quota denominators using the guide below.

### 1. Calibrating Your Account Denominators (3-Step Method)

1. **Record Initial Baseline**: Open the Quota Lens side pane and note your current 5-hour remaining quota $R_1$ (e.g. $100.00\%$);
2. **Execute a Typical Turn**: Prompt the Agent for a standard operation (e.g., generating a function or small module). After completion, check the token statistics at the bottom of the turn card:
   - Note input tokens $T_{\text{in}}$, output tokens $T_{\text{out}}$, and cache read tokens $T_{\text{cache}}$;
   - **Compute Weighted Tokens $W$**:
     - For **Gemini Models**: $W = T_{\text{in}} + 3.0 \times T_{\text{out}} + 0.05 \times T_{\text{cache}}$
     - For **Claude / GPT Models**: $W = T_{\text{in}} + 5.0 \times T_{\text{out}} + 0.1 \times T_{\text{cache}}$
3. **Derive the 1% Denominator**: Note the official remaining quota decrease $\Delta R = R_1 - R_2$ (e.g. consumed $0.50\%$):
   $$\text{Per 1% Quota Denominator (Denom)} = \frac{W}{\Delta R}$$
   *(Example: If a Claude turn generated 24,000 weighted tokens and consumed 10.0%, then your per 1% denominator is $24,000 / 10.0 = 2,400$)*

### 2. Customizing Denominators via Config File (No Code Changes)

Quota Lens supports overriding default benchmark denominators via a local configuration file:

- **Global Plugin Path**: `~/.gemini/config/plugins/quota-lens/sidecars/panel/.data/config.json`
- **Local Dev Path**: `<repo-root>/sidecars/panel/.data/config.json`

Simply add the following fields to the JSON file (create it if it does not exist):

```json
{
  "autoRefresh": true,
  "refreshIntervalSec": 8,
  "defaultGroup": "gemini",
  "lang": "en-US",
  "geminiDenom5h": 280000,
  "geminiWeeklyRatio": 4.0,
  "threePDenom5h": 2400,
  "threePWeeklyRatio": 2.0
}
```

#### Parameter Reference:

| Parameter Key | Default (Jio Tier) | Description |
| :--- | :--- | :--- |
| `geminiDenom5h` | `280000` | Weighted token units consumed per 1% of Gemini 5-hour quota |
| `geminiWeeklyRatio` | `4.0` | Periodic ratio between weekly and 5-hour Gemini quota (Weekly = 5h / Ratio) |
| `threePDenom5h` | `2400` | Weighted token units consumed per 1% of Claude & GPT 5-hour quota |
| `threePWeeklyRatio` | `2.0` | Periodic ratio between weekly and 5-hour 3P quota |

After saving, reopen Antigravity or reopen the side panel, and Quota Lens will immediately calculate consumption using your personalized subscription baselines.

---

## Repository Structure

```text
quota-lens/
├── plugin.json                       # Plugin manifest declaration
├── LICENSE                           # MIT Open Source License
├── assets/
│   ├── logo.svg                      # Clean vector plugin logo
│   └── readme/
│       ├── hero.svg                  # High-resolution README hero banner
│       └── architecture.svg          # System architecture vector diagram
├── skills/
│   └── quota-planner/                # Task planning quota estimation & dynamic scaling skill
│       ├── SKILL.md                  # Skill workflow guide & budget presentation rules
│       ├── scripts/
│       │   └── check_quota.mjs       # ConnectRPC native quota inspection CLI (Zero-Dep)
│       └── references/
│           └── quota_matrix.md       # Quota estimation empirical reference matrix
└── sidecars/
    └── panel/
        ├── package.json              # Sidecar metadata (Zero Dependencies)
        ├── sidecar.json              # Auxiliary pane view registration
        ├── main.mjs                  # Backend engine: ConnectRPC, delta computation, transcript parser
        ├── index.html                # Frontend markup: pure vector SVG UI, i18n placeholders
        ├── app.js                    # Frontend logic: i18n engine, polling, countdown tickers
        └── styles.css                # Adaptive theme stylesheet (light & dark mode compliant)
```

---

## License

This project is licensed under the [MIT License](LICENSE).
