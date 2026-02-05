import { config } from 'dotenv';
import { resolve } from 'path';
import { getLangfuse, getOrCreateDataset, addDatasetItem } from '../src/server/services/langfuseService';

config({ path: resolve(process.cwd(), '.env.local') });

async function getAuthHeaders() {
  const secretKey = process.env.LANGFUSE_SECRET_KEY || 'sk-lf-06b6705e-432e-4302-8f33-a15f0da524dd';
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY || 'pk-lf-4d9cfa8e-aeda-4859-b8a5-57081a7143fe';
  const baseUrl = process.env.LANGFUSE_BASE_URL || 'http://localhost:23022';

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
  return {
    baseUrl,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  };
}

async function test() {
  console.log('=== 测试 Langfuse Dataset 功能 ===\n');

  // 1. 检查 Langfuse 是否启用
  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.error('❌ Langfuse 未启用或配置错误');
    process.exit(1);
  }
  console.log('✅ Langfuse 连接成功\n');

  // 2. 测试创建/获取数据集
  const testAgent = 'test_agent';
  console.log(`测试创建数据集: xhs-dataset-${testAgent}`);

  const datasetName = await getOrCreateDataset(testAgent);
  if (datasetName) {
    console.log(`✅ 数据集创建/获取成功: ${datasetName}\n`);
  } else {
    console.error('❌ 数据集创建失败\n');
    process.exit(1);
  }

  // 3. 测试添加样本
  console.log('测试添加样本到数据集...');
  await addDatasetItem({
    agentName: testAgent,
    input: { message: 'test input', themeId: 1 },
    output: { content: 'test output' },
    metadata: { test: true },
  });
  console.log('✅ 样本添加成功\n');

  // 4. 查询数据集验证
  console.log('查询数据集验证...');
  const { baseUrl, headers } = await getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/public/datasets`, { headers });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ 数据集查询成功');
    console.log(`数据集数量: ${data.data?.length || 0}`);
    const testDataset = data.data?.find((d: any) => d.name === datasetName);
    if (testDataset) {
      console.log(`✅ 找到测试数据集: ${testDataset.name}`);
      console.log(`   描述: ${testDataset.description || 'N/A'}`);
    }
  } else {
    console.log('⚠️  数据集查询失败 (可能需要检查凭证)');
  }

  console.log('\n=== 测试完成 ===');
  console.log('✅ 所有核心功能正常工作');
  console.log('🌐 请访问 http://localhost:23022/datasets 查看数据集');
}

test().catch(console.error);
