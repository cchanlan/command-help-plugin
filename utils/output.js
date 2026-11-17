import { commandNames } from './commands.js'
import { ruleDetails } from './details.js'
import { sendSucceeded } from './send.js'

export { helpText } from './helpContent.js'

/** 目录用简明名；精确测试保留被测消息，不把关闭改写成打开。 */
export function commandBlocks(records, label = '', query = '', seen = new Set(), options = {}) {
  const blocks = []
  let unexpanded = false
  const word = query.replace(/^[#＃*＊]/, '').trim().toLowerCase()
  for (const record of records) {
    if (record.internalExpanded) continue
    const extracted = record.commands || commandNames(record.source, record.flags)
    if (!options.exactText && (extracted.limited || extracted.uncertain)) unexpanded = true
    const matching = word ? extracted.commands.filter(command => command.toLowerCase().includes(word)) : []
    const details = ruleDetails(record)
    const commands = options.exactText ? [options.exactText] : matching.length ? matching : extracted.commands
    for (const command of commands) {
      const fnc = typeof record.rule.fnc === 'string' ? record.rule.fnc : record.rule.fnc?.name || ''
      const key = JSON.stringify([record.group, command, fnc, record.event, record.rule.permission, details.priorityText])
      if (seen.has(key)) continue
      seen.add(key)
      const notes = record.availability?.notes || []
      blocks.push(`${label ? label + ' · ' : ''}${record.group}\n${command}\n优先级：${details.priorityText}\n${details.descriptionLabel}：${details.description}${notes.length ? '\n适用：' + notes.join('；') : ''}${record.internal ? '\n来源：内部规则候选' : ''}`)
    }
  }
  if (unexpanded) blocks.push('部分指令名称暂未展开')
  return blocks
}

/** 只报告候选与顺序，不执行 accept、上下文或业务方法。 */
export function conflictBlocks(records, text, broad) {
  const blocks = ['仅展示规则候选，实际响应以插件处理为准。']
  let position = 0
  for (const record of records) {
    if (record.internalExpanded) continue
    const details = ruleDetails(record)
    const notes = record.availability?.notes || []
    const candidate = broad.has(record.id) ? '通用监听候选' : '指令候选'
    blocks.push(`${++position}. ${candidate} · ${record.group}\n${text}\n优先级：${details.priorityText}\n${details.descriptionLabel}：${details.description}${notes.length ? '\n适用：' + notes.join('；') : ''}${record.internal ? '\n来源：内部规则候选' : ''}`)
  }
  if (!position) blocks.push('当前会话没有匹配候选')
  return blocks
}

export function parseQuery(text, prefix) {
  let query = String(text).slice(prefix.length).trim()
  if (prefix === '#指令') query = query.replace(/^\+\s*/, '')
  const pageMatch = query.match(/(?:^|\s)第([1-9]\d*)页$/)
  const page = pageMatch ? Number(pageMatch[1]) : 1
  if (pageMatch) query = query.slice(0, pageMatch.index).trim()
  let mode = prefix === '#测试命令' ? 'exact' : prefix === '#指令冲突' ? 'conflict' : 'auto'
  if (mode === 'auto') {
    const explicit = query.match(/^(插件|搜索)\s+([\s\S]+)$/)
    if (explicit) { mode = explicit[1] === '插件' ? 'plugin' : 'search'; query = explicit[2].trim() }
  }
  return { query, page, mode }
}

// 合并转发共 50 条消息：1 条标题 + 最多 49 条内容。
export function paginate(blocks, size = 49, length = 1400) {
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
        if (sendSucceeded(result)) return true
      }
    } catch (error) { globalThis.logger?.debug?.(`[指令帮助] 合并转发回退文字: ${error.message}`) }
  }
  for (const message of messages) await e.reply(message)
  return true
}
