import plugin from '../../../lib/plugins/plugin.js'
import loader from '../../../lib/plugins/loader.js'
import { findGroups, related, visibleRules, normalizeName } from '../utils/catalog.js'
import { getCatalog, visibleCatalog } from '../utils/searchIndex.js'
import { matchRules } from '../utils/matcher.js'
import { helpText, parseQuery, commandBlocks, conflictBlocks, sendPage } from '../utils/output.js'
import { replyHelpImage } from '../utils/render.js'
import { directoryGroups, pluginLabel } from '../utils/pluginNames.js'

/** 整名优先，再按最长插件名前缀识别「插件 关键词」。 */
export function resolveScope(groups, query, includeModules = false) {
  const exact = text => {
    const needle = normalizeName(text)
    return groups.filter(group => [...(includeModules ? group.names : group.aliases), group.displayName, group.queryName].some(name => name && normalizeName(name) === needle))
  }
  const whole = exact(query)
  if (whole.length) return { groups: whole, keyword: '' }
  const spaces = [...query.matchAll(/\s+/g)].map(match => match.index).reverse()
  // 先尝试准确的插件名前缀，不让「小火花体力阈值」这种模块名模糊匹配吞掉关键词。
  for (const lookup of [exact, text => findGroups(groups, text, includeModules)]) {
    for (const index of spaces) {
      const found = lookup(query.slice(0, index))
      if (found.length) return { groups: found, keyword: query.slice(index).trim() }
    }
  }
  const fuzzy = findGroups(groups, query, includeModules)
  return { groups: fuzzy, keyword: fuzzy.length ? '' : query }
}

export class CommandHelp extends plugin {
  constructor() {
    super({
      name: '指令帮助', dsc: '插件目录、关键词检索、完整消息测试与冲突诊断',
      event: 'message', priority: -501,
      rule: [
        { reg: /^#指令冲突/, fnc: 'conflict', desc: '查看规则匹配顺序与候选冲突' },
        { reg: /^#指令/, fnc: 'lookup', desc: '查看插件目录或搜索指令' },
        { reg: /^#测试命令/, fnc: 'test', desc: '只匹配完整消息，不执行命令' },
      ],
    })
  }
  async lookup(e) { return this.handle(e, '#指令') }
  async test(e) { return this.handle(e, '#测试命令') }
  async conflict(e) { return this.handle(e, '#指令冲突') }

  async handle(e, prefix) {
    const { query, page, mode } = parseQuery(e.msg, prefix)
    if (query.length > 200) { await e.reply('查询内容请控制在200字以内'); return true }
    try {
      if (mode === 'auto' && ['帮助', 'help'].includes(query.toLowerCase())) {
        if (!await replyHelpImage(e, 'help')) await e.reply(helpText)
        return true
      }
      if (['exact','conflict'].includes(mode) && !query) {
        await e.reply(mode === 'exact' ? '请发送：#测试命令#绑定' : '请发送：#指令冲突 #绑定')
        return true
      }
      const fullCatalog = await getCatalog(loader)
      const catalog = visibleCatalog(fullCatalog, e, loader)
      let blocks = [], title
      if (mode === 'auto' && ['', '列表', '总览', '插件'].includes(query)) {
        if (page === 1 && await replyHelpImage(e, 'directory', catalog)) return true
        const visible = directoryGroups(catalog)
        title = `指令目录 · ${visible.length}个插件`
        blocks = [helpText, ...visible.map(group => `${group.folder}：#指令${pluginLabel(group).query}`)]
      } else {
        const scope = ['auto','plugin'].includes(mode) ? resolveScope(catalog.groups, query, mode === 'plugin') : { groups: [], keyword: query }
        if (scope.groups.length && !scope.keyword) {
          title = `插件指令 · ${scope.groups.map(group => group.folder).join('、')}`
          blocks = commandBlocks(visibleRules(scope.groups.flatMap(group => group.rules), e, loader))
          if (!blocks.length) blocks.push('当前会话暂无可展示的指令')
        } else if (mode === 'plugin' && !scope.groups.length) {
          title = '插件指令'; blocks = ['没有找到对应插件，请发送：#指令']
        } else {
          const word = scope.groups.length ? scope.keyword : query
          const normalized = typeof loader.dealText === 'function' ? loader.dealText(word) : word.replace(/^[＃井]/, '#').replace(/^[＊※]/, '*').trim()
          const records = visibleRules(scope.groups.length ? scope.groups.flatMap(group => group.rules) : catalog.rules, e, loader)
          const result = await matchRules(records, [normalized])
          if (result.busy) { await e.reply('查询较多，请稍后再试'); return true }
          const direct = [], nearby = [], broad = []
          for (const record of records) {
            const hit = result.matched.has(record.id)
            if (!hit && (['exact','conflict'].includes(mode) || !related(record, word))) continue
            if (result.broad.has(record.id)) {
              if (['exact','conflict'].includes(mode)) broad.push(record)
              else if (related(record, word)) nearby.push(record)
            } else if (hit) direct.push(record)
            else nearby.push(record)
          }
          if (mode === 'conflict') {
            const all = records.filter(record => result.matched.has(record.id))
            blocks = conflictBlocks(all, normalized, result.broad)
            title = `冲突诊断：${word}`
          } else {
            const seen = new Set(), options = mode === 'exact' ? { exactText: normalized } : {}
            blocks = [...commandBlocks(direct, '匹配指令', word, seen, options), ...commandBlocks(nearby, '相关指令', word, seen)]
            if (broad.length) blocks.push(`其他消息响应插件\n${[...new Set(broad.filter(record => !record.internalExpanded).map(record => record.group))].join('、') || '暂无'}`)
            title = scope.groups.length ? `插件内搜索：${scope.groups.map(group => group.folder).join('、')} · ${word}` : `搜索：${word}`
          }
          if (!blocks.length) blocks.push(result.incomplete || result.errors.length ? '本次查询未完成，请稍后再试' : '当前会话没有找到相关指令')
          if (result.incomplete || result.errors.length) {
            blocks.unshift('本次仅展示已完成的查询结果，请稍后再试')
            globalThis.logger?.warn?.(`[指令帮助] 匹配不完整 ${result.checked.size}/${records.length}: ${JSON.stringify(result.errors)}`)
          }
        }
      }
      if (fullCatalog.unavailable) blocks.unshift('部分插件暂未提供指令目录')
      if (fullCatalog.internalWarnings?.length && e.isMaster) blocks.unshift('部分插件的内部指令暂未展开')
      await sendPage(e, blocks, title, page, e.msg)
    } catch (error) {
      globalThis.logger?.error?.(`[指令帮助] 查询失败: ${error.stack || error}`)
      await e.reply('指令查询暂不可用，请稍后再试')
    }
    return true
  }
}
