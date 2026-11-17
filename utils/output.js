export const helpText = `指令帮助
#指令：查看插件目录
#指令列表 / #指令总览 / #指令 插件：查看插件目录
#指令帮助 / #指令help：查看本帮助
#指令插件名：查看插件的全部规则
#指令任意词：查找匹配指令及相关写法
#指令 插件 插件名：只查插件
#指令 搜索 关键词：只搜关键词
#测试命令#绑定：匹配完整消息，不执行
#指令+插件名 / #指令+关键词：也可使用加号分隔
翻页：原查询后加「 第2页」
例如：#指令 喵喵 第2页`

/** 阅读辅助不是可执行示例，复杂语法以完整规则为准。 */
export function readable(source) {
  return source.replace(/^\^/, '').replace(/\$$/, '').replace(/\(\?:/g, '(')
    .replace(/\(\.\*\??\)/g, '<可选内容>').replace(/\(\.\+\??\)/g, '<内容>')
    .replace(/\\s\*/g, '〈可选空格〉').replace(/\\s\+/g, '〈空格〉')
    .replace(/\\d\+/g, '〈数字〉').replace(/\\([#*/])/g, '$1')
}

export function ruleText(record, label, notes = []) {
  const raw = record.flags ? `/${record.source}/${record.flags}` : record.source
  return `${label ? `【${label}】` : ''}${record.group} · ${record.name}\n写法：${readable(record.source)}${record.description ? `\n说明：${record.description}` : ''}${notes.length ? `\n适用：${notes.join('；')}` : ''}\n完整规则：${raw}`
}

export function parseQuery(text, prefix) {
  let query = String(text).slice(prefix.length).trim()
  if (prefix === '#指令') query = query.replace(/^\+\s*/, '')
  const pageMatch = query.match(/(?:^|\s)第([1-9]\d*)页$/)
  const page = pageMatch ? Number(pageMatch[1]) : 1
  if (pageMatch) query = query.slice(0, pageMatch.index).trim()
  let mode = prefix === '#测试命令' ? 'exact' : 'auto'
  if (mode === 'auto') {
    const explicit = query.match(/^(插件|搜索)\s+([\s\S]+)$/)
    if (explicit) { mode = explicit[1] === '插件' ? 'plugin' : 'search'; query = explicit[2].trim() }
  }
  return { query, page, mode }
}

export function paginate(blocks, size = 12, length = 1400) {
  const nodes = []
  for (const block of blocks) {
    // 超长动态正则拆成连续节点和后续页，不截断。
    const points = [...String(block)]
    for (let start = 0; start < points.length; start += length) nodes.push((start ? '（接上条）\n' : '') + points.slice(start, start + length).join(''))
  }
  const pages = []
  for (let start = 0; start < nodes.length; start += size) pages.push(nodes.slice(start, start + size))
  return pages.length ? pages : [[]]
}

export async function sendPage(e, blocks, title, page, original) {
  const pages = paginate(blocks)
  if (!Number.isSafeInteger(page) || page < 1 || page > pages.length) return e.reply(`共${pages.length}页，请发送：${original.replace(/\s+第[1-9]\d*页$/, '')} 第${pages.length}页`)
  const header = `${title}\n第${page}/${pages.length}页${page < pages.length ? `\n下一页：${original.replace(/\s+第[1-9]\d*页$/, '')} 第${page + 1}页` : ''}`
  const messages = [header, ...pages[page - 1]]
  const contact = e.group?.makeForwardMsg ? e.group : e.friend?.makeForwardMsg ? e.friend : e.bot?.makeForwardMsg ? e.bot : null
  if (contact) {
    try {
      const nodes = messages.map(message => ({ user_id: e.self_id || e.bot?.uin || e.user_id, nickname: '指令帮助', message }))
      const forward = await contact.makeForwardMsg(nodes)
      if (forward) {
        const result = await e.reply(forward)
        const error = result?.error
        if (result !== false && !(Array.isArray(error) ? error.length : error) && !result?.retcode) return true
      }
    } catch (error) { globalThis.logger?.debug?.(`[指令帮助] 合并转发回退文字: ${error.message}`) }
  }
  for (const message of messages) await e.reply(message)
  return true
}
