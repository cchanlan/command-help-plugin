import { commandNames } from './commands.js'
import { ruleDetails } from './details.js'
import { getDescriptionStats } from './sourceDescriptions.js'
import { getImageStatus } from './render.js'

export function statusText(catalog) {
  const visible = catalog.rules.filter(record => !record.internalExpanded)
  const names = new Set(), missing = new Set(), partial = new Set()
  for (const record of visible) {
    const extracted = record.commands || commandNames(record.source, record.flags)
    for (const command of extracted.commands) names.add(JSON.stringify([record.group, command]))
    if (!['rule', 'source', 'metadata'].includes(ruleDetails(record).descriptionSource)) missing.add(record.id)
    if (extracted.uncertain || extracted.limited) partial.add(record.id)
  }
  const scan = getDescriptionStats(), images = getImageStatus()
  return [
    '指令帮助状态',
    `目录插件：${catalog.groups.length} 个`,
    `注册规则：${catalog.rules.filter(record => !record.internal).length} 条`,
    `补充内部规则：${catalog.rules.filter(record => record.internal).length} 条`,
    `帮助名称：${names.size} 个（按插件与名称去重，不等同可执行指令数）`,
    `缺少专属说明：${missing.size} 条规则`,
    `名称未完整展开：${partial.size} 条规则`,
    `注册表暂不可读项：${catalog.unavailable || 0} 个`,
    `内部规则未展开：${catalog.internalWarnings?.join('、') || '无已识别的适配失败'}`,
    '内部指令只统计已适配的分发器，不代表所有插件均已展开。',
    `帮助资料需检查：${catalog.metadataWarnings?.join('、') || '无'}`,
    `索引生成时间：${new Date(catalog.createdAt).toISOString().replace('T', ' ').replace('Z', ' UTC')}`,
    `源码缓存：${scan.filesCached} 个文件；累计解析 ${scan.filesParsed} 次，复用 ${scan.cacheHits} 次`,
    `源码未成功解析：${scan.errors} 次（不影响原注册规则）`,
    `图片：${images.stalled ? '截图未结束，暂用文字' : images.pending ? '生成中' : '可接收请求'}；本次加载后渲染 ${images.rendered} 次，缓存命中 ${images.cacheHits} 次`,
    `最近出图回退原因：${images.lastFailure || '无'}`,
    '刷新目录与帮助资料：#指令刷新',
  ].join('\n')
}
