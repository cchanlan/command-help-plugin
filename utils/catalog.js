/** 只读加载器中的实例；绝不重新 new 插件、扫描源码或执行插件钩子。 */
export function snapshot(loader) {
  if (!Array.isArray(loader?.priority)) throw new Error('当前框架未提供 priority 注册表')
  const groups = new Map(), rules = []
  let unavailable = 0
  for (const entry of loader.priority) {
    const instance = entry?.plugin
    if (!instance || typeof instance !== 'object') { unavailable++; continue }
    const key = String(entry.key || instance.__key || entry.name || instance.name || '未命名插件').split(String.fromCharCode(92)).join('/').replace(/^\.?\/?plugins\//, '')
    const folder = key.split('/')[0]
    let group = groups.get(folder)
    if (!group) {
      group = { folder, names: new Set([folder]), aliases: new Set([folder]), entries: [], rules: [], unruled: [] }
      groups.set(folder, group)
    }
    const name = String(entry.name || instance.name || folder)
    group.names.add(name)
    // 自动模式只接受目录名或显式品牌前缀，不把「用户绑定」里的「绑定」认作插件名。
    const brand = name.match(/^[\[【]([^\]】]+)[\]】]/) || name.match(/^([^:：]{1,24})[:：]/)
    if (brand) group.aliases.add(brand[1])
    group.entries.push(entry)
    const registered = Array.isArray(instance.rule) ? instance.rule : []
    if (!registered.length) group.unruled.push(name)
    for (const [index, rule] of registered.entries()) {
      if (!rule) continue
      const regex = rule.reg instanceof RegExp ? rule.reg : null
      const source = regex ? regex.source : String(rule.reg ?? '')
      const flags = regex ? regex.flags : ''
      const record = {
        id: rules.length, group: folder, name, key, index,
        source, flags, rule, instance, entry,
        event: rule.event || instance.event || 'message',
        description: String(rule.dsc || rule.desc || rule.describe || rule.description || ''),
      }
      rules.push(record)
      group.rules.push(record)
    }
  }
  return { groups: [...groups.values()], rules, unavailable }
}

export function normalizeName(value) {
  return String(value).toLowerCase().replace(/[\s_\-\[\]【】]/g, '').replace(/插件|plugin/g, '')
}

export function findGroups(groups, query, includeModules = false) {
  const needle = normalizeName(query)
  if (!needle) return []
  const names = group => [...(includeModules ? group.names : group.aliases || group.names)]
  const exact = groups.filter(g => names(g).some(name => normalizeName(name) === needle))
  return exact.length ? exact : groups.filter(g => names(g).some(name => normalizeName(name).includes(needle)))
}

/** 解码常见转义，只供相关词检索；搜索词不作为正则执行。 */
export function searchable(source) {
  return source.replace(/\\u\{([\da-f]+)\}|\\u([\da-f]{4})|\\x([\da-f]{2})/gi, (all, point, unicode, hex) => {
    const code = parseInt(point || unicode || hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : all
  }).replace(/\\([#*+?.()\[\]{}|/\\])/g, '$1').toLowerCase()
}

export function related(record, query) {
  const word = query.replace(/^[#＃*＊]/, '').trim().toLowerCase()
  return Boolean(word) && (searchable(record.source).includes(word) || record.description.toLowerCase().includes(word))
}

function eventFits(e, expression) {
  const keys = { message: ['post_type', 'message_type', 'sub_type'], notice: ['post_type', 'notice_type', 'sub_type'], request: ['post_type', 'request_type', 'sub_type'] }[e.post_type] || []
  return String(expression).split('.').every((part, i) => part === '*' || part === String(e[keys[i]] ?? ''))
}

/** filtPermission 会发送「无权限」，不能调用它测试。 */
export function status(record, e, loader) {
  const notes = []
  if (!eventFits(e, record.instance.event || 'message') || !eventFits(e, record.event)) notes.push('当前会话不适用')
  try {
    if (typeof loader.checkDisable === 'function' && !loader.checkDisable({ plugin: record.instance, e })) notes.push('当前会话已禁用')
  } catch (error) {
    notes.push('启用状态待确认')
    globalThis.logger?.debug?.(`[指令帮助] 读取启用状态失败 ${record.key}: ${error.message}`)
  }
  const permission = record.rule.permission || 'all'
  const labels = { master: '仅主人', owner: '仅群主', admin: '仅群管理员', all: '所有人' }
  if (permission !== 'all') notes.push(labels[permission] || `权限：${permission}`)
  const member = e.member || {}, role = e.sender?.role || e.sender_role
  const isGroup = e.isGroup || e.message_type === 'group'
  const blocked = !e.isMaster && (permission === 'master' || (isGroup && ((permission === 'owner' && !member.is_owner && role !== 'owner') || (permission === 'admin' && !member.is_owner && !member.is_admin && role !== 'owner' && role !== 'admin'))))
  // 私聊 admin/owner 按宿主语义不额外阻断；未知权限不冒充已验证。
  return { notes, eligible: !blocked && !notes.some(n => ['当前会话不适用', '当前会话已禁用', '启用状态待确认'].includes(n)) && ['all', 'master', 'owner', 'admin'].includes(permission) }
}
