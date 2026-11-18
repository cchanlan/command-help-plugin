/** 仅读取插件公开的说明，不用指令名称猜业务效果。 */
export function brief(value, max = 42) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  if (!text || ['无', '暂无', '无描述', '暂无描述', 'your-plugin', 'undefined', 'null'].includes(text)) return ''
  const chars = [...text]
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text
}

export function ruleDetails(record) {
  const rule = record.rule || {}
  const instance = record.instance || {}
  const fn = typeof rule.fnc === 'function' ? rule.fnc : instance[rule.fnc]
  const own = [rule.dsc, rule.desc, rule.describe, rule.description, fn?.dsc, fn?.desc, fn?.description, record.description].map(value => brief(value)).find(Boolean)
  const module = [instance.dsc, instance.desc, instance.description].map(value => brief(value)).find(Boolean)
  const name = brief(record.name?.replace(/^[\[【][^\]】]+[\]】]\s*/, '').replace(/^[^:：]+[:：]\s*/, ''))
  const source = brief(record.sourceDescription)
  const supplied = brief(record.metadata?.description)
  const description = supplied || own || source || module || name || '暂无说明'
  let priority = Number(record.entry?.priority)
  if (record.entry?.priority === undefined || record.entry?.priority === null || Number.isNaN(priority)) priority = Number(instance.priority)
  if (instance.priority === undefined && (record.entry?.priority === undefined || record.entry?.priority === null) || Number.isNaN(priority)) priority = 5000
  const priorityText = priority === -Infinity ? '-∞' : priority === Infinity ? '+∞' : String(priority)
  return { description, descriptionSource: supplied ? 'metadata' : own ? 'rule' : source ? 'source' : module ? 'module' : name ? 'name' : 'missing', descriptionLabel: supplied || own || source ? '说明' : module ? '模块说明' : name ? '功能名称' : '说明', priority, priorityText }
}
