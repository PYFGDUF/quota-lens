---
name: quota-planner
description: Predict quota consumption during task planning (/plan), check real-time remaining 5-hour and weekly limits, warn users when limits are constrained, and dynamically adjust task scale/scope with user consent.
---

# Quota Planner (配额预算与动态调优技能)

本技能使 Agent 在任务规划阶段（包括 `/plan`、处理中大型架构改动或长交互任务时），能够主动探测实时配额余量、科学预测任务消耗、识别配额瓶颈，并在必要时协助用户动态调整任务规模。

---

## 核心工作流程

```text
1. 实时探测 -> 2. 规模测算 -> 3. 风险评级 -> 4. 配额卡片输出 -> 5. 协商缩放(如超限)
```

---

## 第 1 步：探测当前实时配额状态

在制定任务计划前，首先调用内置辅助脚本获取当前精准的配额剩余和重置时间：

```bash
node "$(dirname "$0")/scripts/check_quota.mjs" --json
```
*(若在外部环境运行，可指定插件目录下的脚本绝对路径 `~/.gemini/config/plugins/quota-lens/skills/quota-planner/scripts/check_quota.mjs`)*

从返回的 JSON 结构中读取关键指标：
- `current.limit5h.remainingPercent`：当前 5 小时剩余百分比及刷新倒计时；
- `current.limitWeekly.remainingPercent`：当前每周剩余百分比及刷新倒计时；
- `status`：健康状态（`green` / `yellow` / `red`）；
- `safeRecommendedBudget`：推荐单次任务安全配额上限。

---

## 第 2 步：测算任务预估消耗

查阅 [配额测算参考矩阵](references/quota_matrix.md)，根据任务复杂度进行用量建模：

1. **评估交互轮次 (Estimated Turns)**：
   - 简单改动（1-2 文件微调）：预估 1 - 3 轮；
   - 中型功能（新增模块、多文件协同、带测试）：预估 4 - 8 轮；
   - 大型重构（跨目录、深度重构、系统迁移）：预估 9 - 15 轮；
   - 派生子代理（subagent）：每个独立子代理额外计 2 - 4 轮等效消耗。
2. **计算预估消耗值 ($\Delta$)**：
   - 根据 $\frac{\Delta 5\text{h}}{\Delta \text{Weekly}} = 4.0000$ 恒等式：
     $$\text{预估 } \Delta 5\text{h} = \text{轮数} \times \text{单轮基准消耗 (约 0.25\%)}$$
     $$\text{预估 } \Delta \text{Weekly} = \frac{\Delta 5\text{h}}{4.0000}$$

---

## 第 3 步：风险等级与安全阈值评定

将预估消耗与第 1 步读取的剩余量进行比对，计算配额占用率：
$$R = \frac{\text{任务预估 } \Delta 5\text{h}}{\text{当前剩余 } 5\text{h} \text{ 配额}}$$

- **绿色区 ($R \le 25\%$ 且 5h 剩余 $\ge 35\%$)**：
  配额充裕，无中断风险，按全量计划执行。
- **黄色区 ($25\% < R \le 50\%$ 或 5h 剩余 $20\% \sim 35\%$)**：
  轻度受限，在计划中列出配额提示，提醒用户适度关注。
- **红色区 ($R > 50\%$ 或 5h 剩余 $< 15\%$ 或 每周剩余 $< 10\%$)**：
  **高风险紧绷**。极可能在执行中途触发模型配额耗尽，导致任务被迫中断。**必须启动动态调优协商**。

---

## 第 4 步：在计划中呈现“配额预算卡片”

在向用户提交 Implementation Plan 或规划输出时，在文首或引言处嵌入标准配额卡片：

```markdown
> [!NOTE]
> ### 任务配额预算与健康度评估 (Quota Lens)
> - **当前余量**：5 小时配额 **99.78%**（4h 56m 后刷新）｜ 每周配额 **72.41%**（6d 15h 后刷新）
> - **预估消耗**：约 **1.50%** (5h) / **0.38%** (每周) ｜ 预估交互 **5 - 6** 轮
> - **安全状态**：[绿色安全]（预估占用剩余容量的 1.5%）
```

---

## 第 5 步：动态调整任务规模（限配额紧绷/超限时）

当且仅当进入**红色风险区**时，Agent **不得盲目开始全量耗费性操作**，而应在计划中向用户提出清晰的 3 档缩减方案，并使用 `ask_question` 工具或文本交互征求用户同意：

### 缩减策略选项：
1. **策略 A：全量推进 (Full Scope)**
   - 保持原始设计不变，若用户确认当前任务极其紧急且愿意承受配额耗尽等待刷新，则直接执行。
2. **策略 B：分阶段里程碑 (Phased Milestones / MVP 先行)**
   - 将大型任务拆分为两期：
     - **第一期 (Phase 1)**：仅实现最核心的核心路径（MVP），消耗控制在安全预算内（例如仅消耗剩余配额的 20%）；
     - **第二期 (Phase 2)**：外围功能、文档、额外优化等，提示用户等待 5 小时配额刷新或后续再执行。
3. **策略 C：精简瘦身模式 (Lean Mode / 降级策略)**
   - 减少非必要的多代理派生（Subagent），改为主代理单线串行完成；
   - 辅佐性搜索与代码调查指定采用轻量模型（如 `flash` / `flash_lite`），将模型成本系数压低至 $0.2\times$；
   - 剔除耗费大量轮次的大规模自动化批量改写，优先采取最小改动（Minimal Diff）。

### 确认后响应：
用户选定缩减方案后，Agent 立即重构并收敛 Implementation Plan 中的待执行任务项，将预估配额重新压入安全阈值内，随后启动执行。
