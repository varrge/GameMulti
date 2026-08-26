import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginClientGeneratorController } from './plugin-client-generator.controller';

test('插件客户端管理页不再显示英文操作文案', () => {
  const page = new PluginClientGeneratorController().page();

  for (const text of [
    'Plugin Client',
    'Admin Key',
    'Install Token Hours',
    'Install Config',
    'Plugin Version',
    'Protocol Version',
    'Expires In Hours',
    'Deploy Update',
    'Deploy Status',
    'Loading servers',
    'Servers loaded',
    'Creating install token',
    'Creating plugin client',
    'Request failed',
  ]) {
    assert.equal(page.includes(text), false, `仍存在英文文案：${text}`);
  }

  for (const text of ['插件客户端管理', '管理员密钥', '安装令牌有效期', '部署更新', '正在加载服务器']) {
    assert.equal(page.includes(text), true, `缺少中文文案：${text}`);
  }
});
