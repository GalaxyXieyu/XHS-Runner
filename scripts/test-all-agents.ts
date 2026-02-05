import { config } from 'dotenv';
import { resolve } from 'path';
import { getOrCreateDataset, addDatasetItem } from '../src/server/services/langfuseService';

config({ path: resolve(process.cwd(), '.env.local') });

// 所有可能的 agent 名称
const ALL_AGENTS = [
  'supervisor',
  'supervisor_route',
  'research_agent',
  'research_tools',
  'style_analyzer_agent',
  'writer_agent',
  'image_planner_agent',
  'image_agent',
  'review_agent',
];

async function testAllAgents() {
  console.log('=== 测试所有 Agent 的 Dataset 记录 ===\n');

  for (const agentName of ALL_AGENTS) {
    console.log(`测试 ${agentName}...`);

    try {
      // 1. 创建/获取数据集
      const datasetName = await getOrCreateDataset(agentName);
      if (!datasetName) {
        console.log(`  ❌ 数据集创建失败\n`);
        continue;
      }
      console.log(`  ✅ 数据集: ${datasetName}`);

      // 2. 添加样本
      await addDatasetItem({
        agentName,
        input: { test: true, agent: agentName },
        output: { success: true },
        metadata: { test: true, timestamp: new Date().toISOString() },
      });
      console.log(`  ✅ 样本添加成功\n`);
    } catch (error) {
      console.error(`  ❌ 错误:`, error);
      console.log('');
    }
  }

  console.log('=== 验证结果 ===');
  console.log('请访问 http://localhost:23022/datasets 查看所有数据集');
  console.log('预期看到以下数据集:');
  ALL_AGENTS.forEach(agent => console.log(`  - xhs-dataset-${agent}`));
}

testAllAgents().catch(console.error);
