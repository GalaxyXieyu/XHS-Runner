/**
 * 测试单个 Agent 执行的实际时间
 * 运行: npx tsx scripts/test-agent-timing.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { HumanMessage } from '@langchain/core/messages';
import { createMultiAgentSystem } from '../src/server/agents/multiAgentSystem';
import { processAgentStream } from '../src/server/agents/utils/streamProcessor';

async function testAgentTiming() {
  const testIdea = `围绕「护肤」写一篇小红书图文。参考爆款标题方向：敏感肌必看！这个平价水乳真的绝了。建议标签：护肤 敏感肌 平价好物 学生党。面向普通用户 目标：提升collects 给出：标题、正文（分段+要点）、5-10个标签。`;

  console.log('=== Agent 执行时间测试 ===\n');
  console.log('测试 Idea:', testIdea.slice(0, 50) + '...\n');

  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 开始执行...`);

  try {
    const app = await createMultiAgentSystem({ enableHITL: false });

    const initialState: any = {
      messages: [new HumanMessage(testIdea)],
      themeId: 1, // 使用测试主题 ID
      creativeId: 9999, // 使用测试 creative ID
    };

    const stream = await app.stream(initialState, { recursionLimit: 100 } as any);

    let nodeCount = 0;
    for await (const event of processAgentStream(stream, {
      themeId: 1,
      creativeId: 9999,
      enableHITL: false,
    })) {
      nodeCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] 节点 ${nodeCount}: ${JSON.stringify(event).slice(0, 100)}...`);
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n=== 测试完成 ===`);
    console.log(`总执行时间: ${totalTime.toFixed(1)} 秒`);
    console.log(`节点数量: ${nodeCount}`);
    console.log(`\n建议 PER_IDEA_TIMEOUT_MS: ${Math.ceil(totalTime * 1.5)} 秒 (1.5x buffer)`);
    console.log(`建议 JOB_TYPE_TIMEOUTS.daily_generate: ${Math.ceil(totalTime * 1.5 * 5)} 秒 (5 ideas)`);

  } catch (err: any) {
    const totalTime = (Date.now() - startTime) / 1000;
    console.error(`\n[${totalTime.toFixed(1)}s] 执行失败:`, err?.message || err);
  }
}

testAgentTiming().catch(console.error);
