/**
 * 测试 AgentLogger 日志格式
 */

import {
  startTraj,
  logSupervisor,
  logAgent,
  endTraj,
  getLogText,
  getTraj,
  parseLog,
  StateSnapshot,
} from "../src/server/agents/utils/agentLogger";

// 模拟一个完整的轨迹
const threadId = "test_traj_001";

console.log("=== 开始测试 AgentLogger ===\n");

// 1. 开始轨迹
startTraj(threadId, "帮我写一篇关于 Cursor AI 编程技巧的小红书笔记", true, 5);

// 2. 模拟 supervisor 决策序列
const states: StateSnapshot[] = [
  { R: 0, C: 0, S: 0, Ip: 0, Ig: 0, rev: "-", i: 0, max: 3 },
  { R: 1, C: 0, S: 0, Ip: 0, Ig: 0, rev: "-", i: 0, max: 3 },
  { R: 1, C: 0, S: 1, Ip: 0, Ig: 0, rev: "-", i: 0, max: 3 },
  { R: 1, C: 1, S: 1, Ip: 0, Ig: 0, rev: "-", i: 0, max: 3 },
  { R: 1, C: 1, S: 1, Ip: 4, Ig: 0, rev: "-", i: 0, max: 3 },
  { R: 1, C: 1, S: 1, Ip: 4, Ig: 4, rev: "-", i: 0, max: 3 },
  { R: 1, C: 1, S: 1, Ip: 4, Ig: 4, rev: "approved", i: 1, max: 3 },
];

const decisions: { next: any; reason: string }[] = [
  { next: "research_agent", reason: "需先研究收集爆款素材" },
  { next: "style_analyzer_agent", reason: "有参考图需先分析风格" },
  { next: "writer_agent", reason: "风格完成,进入内容创作" },
  { next: "image_planner_agent", reason: "内容完成,规划配图" },
  { next: "image_agent", reason: "已规划4张,开始生成" },
  { next: "review_agent", reason: "图片完成,进入审核" },
  { next: "END", reason: "审核通过,流程结束" },
];

const agents: { name: any; summary: string }[] = [
  { name: "research_agent", summary: "找到15篇爆款,均赞2.3k" },
  { name: "style_analyzer_agent", summary: "3D,dreamy,White/Blue/Orange" },
  { name: "writer_agent", summary: "title=3个Cursor技巧让你效率翻倍" },
  { name: "image_planner_agent", summary: "plans=4" },
  { name: "image_agent", summary: "generated=4" },
  { name: "review_agent", summary: "approved=1 score=8.5" },
];

// 交替记录 supervisor 决策和 agent 执行
for (let i = 0; i < decisions.length; i++) {
  logSupervisor(threadId, states[i], decisions[i].next, decisions[i].reason);
  if (i < agents.length) {
    logAgent(threadId, agents[i].name, true, agents[i].summary);
  }
}

// 3. 结束轨迹
endTraj(threadId, true, { creative: 123, images: 4 });

// 4. 输出结果
console.log("\n=== 紧凑日志格式 ===\n");
// 注意：endTraj 后轨迹已被删除，需要在 endTraj 前获取
// 这里重新运行一次来展示

const threadId2 = "test_traj_002";
startTraj(threadId2, "测试日志格式", false);
logSupervisor(threadId2, states[0], "research_agent", "开始研究");
logAgent(threadId2, "research_agent", true, "研究完成");
logSupervisor(threadId2, states[1], "END", "流程结束");

const logText = getLogText(threadId2);
const traj = getTraj(threadId2);

console.log(logText);

console.log("\n=== JSON 格式 ===\n");
console.log(JSON.stringify(traj, null, 2));

console.log("\n=== 解析验证 ===\n");
const parsed = parseLog(logText);
console.log("解析结果:", parsed ? "成功" : "失败");
console.log("步骤数:", parsed?.steps.length);

console.log("\n=== Token 对比 ===\n");
const jsonStr = JSON.stringify(traj);
console.log(`紧凑格式: ${logText.length} 字符`);
console.log(`JSON 格式: ${jsonStr.length} 字符`);
console.log(`压缩率: ${Math.round((1 - logText.length / jsonStr.length) * 100)}%`);
