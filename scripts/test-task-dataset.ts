import { config } from 'dotenv';
import { resolve } from 'path';
import { getOrCreateDataset } from '../src/server/services/langfuseService';

config({ path: resolve(process.cwd(), '.env.local') });

async function test() {
  console.log('=== 测试 Task 系统 Dataset 记录 ===\n');

  // 检查是否有新的数据集被创建（通过 task 系统创建的）
  const agents = ['supervisor', 'research_agent', 'writer_agent', 'image_planner_agent', 'image_agent', 'review_agent'];

  console.log('检查已存在的数据集：\n');

  const secretKey = 'sk-lf-06b6705e-432e-4302-8f33-a15f0da524dd';
  const publicKey = 'pk-lf-4d9cfa8e-aeda-4859-b8a5-57081a7143fe';
  const baseUrl = 'http://localhost:23022';
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

  const response = await fetch(`${baseUrl}/api/public/datasets`, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.ok) {
    const data = await response.json();
    const datasets = data.data || [];

    console.log(`找到 ${datasets.length} 个数据集:\n`);

    agents.forEach(agent => {
      const datasetName = `xhs-dataset-${agent}`;
      const exists = datasets.some((d: any) => d.name === datasetName);
      console.log(`  ${exists ? '✅' : '❌'} ${datasetName}`);
    });

    console.log('\n=== 测试步骤 ===');
    console.log('1. 运行一个 task 请求：');
    console.log('   curl -X POST http://localhost:3000/api/tasks \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"message":"测试生成","themeId":1}\'');
    console.log('\n2. 等待任务完成');
    console.log('3. 再次运行此脚本查看是否有新样本被添加');
  } else {
    console.error('查询失败:', await response.text());
  }
}

test().catch(console.error);
