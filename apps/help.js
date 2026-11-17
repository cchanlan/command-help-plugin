import plugin from '../../../lib/plugins/plugin.js'
import loader from '../../../lib/plugins/loader.js'
import { snapshot, findGroups, related, status } from '../utils/catalog.js'
import { matchRules } from '../utils/matcher.js'
import { helpText, parseQuery, ruleText, sendPage } from '../utils/output.js'

export class CommandHelp extends plugin {
  constructor() {
    super({
      name: '指令帮助', dsc: '指令目录、插件帮助、关键词与完整消息匹配',
      event: 'message', priority: -501,
      rule: [
        { reg: /^#指令/, fnc: 'lookup' },
        { reg: /^#测试命令/, fnc: 'test' },
      ],
    })
  }

  async lookup(e) { return this.handle(e, '#指令') }
  async test(e) { return this.handle(e, '#测试命令') }

  async handle(e, prefix) {
    const { query, page, mode } = parseQuery(e.msg, prefix)
    if (query.length > 200) { await e.reply('查询内容请控制在200字以内'); return true }
    if (mode === 'auto' && ['帮助', 'help'].includes(query.toLowerCase())) { await e.reply(helpText); return true }
    if (mode === 'exact' && !query) { await e.reply('请发送：#测试命令#绑定'); return true }
    try {
      const catalog = snapshot(loader)
      let blocks = [], title
      if (mode === 'auto' && ['', '列表', '总览', '插件'].includes(query)) {
        title = `指令目录 · ${catalog.groups.length}个插件 · ${catalog.rules.length}条规则`
        blocks = [helpText, ...catalog.groups.map(group => `${group.folder} · ${group.rules.length}条规则\n模块：${[...group.names].filter(n => n !== group.folder).join('、') || group.folder}\n查看：#指令 ${group.folder}`)]
      } else {
        const groups = ['auto', 'plugin'].includes(mode) ? findGroups(catalog.groups, query, mode === 'plugin') : []
        if (groups.length) {
          title = `插件指令 · ${groups.map(g => g.folder).join('、')} · ${groups.reduce((n, g) => n + g.rules.length, 0)}条规则`
          for (const group of groups) {
            blocks.push(...group.rules.map(record => ruleText(record, '', status(record, e, loader).notes)))
            if (group.unruled.length) blocks.push(`${group.folder}\n未注册指令规则的模块：${[...new Set(group.unruled)].join('、')}`)
          }
        } else if (mode === 'plugin') {
          blocks = [`没有找到「${query}」对应的插件\n查看目录：#指令`]
          title = '插件指令'
        } else {
          const normalized = typeof loader.dealText === 'function' ? loader.dealText(query) : query.replace(/^[＃井]/, '#').replace(/^[＊※]/, '*').trim()
          const probe = { ...e, msg: normalized, message: [{ type: 'text', text: normalized }] }
          const result = await matchRules(catalog.rules, [normalized])
          if (result.busy) { await e.reply('查询较多，请稍后再试'); return true }
          let direct = 0, nearby = 0, broad = 0
          for (const record of catalog.rules) {
            const hit = result.matched.has(record.id)
            if (!hit && (mode === 'exact' || !related(record, query))) continue
            const state = status(record, probe, loader)
            const wide = result.broad.has(record.id)
            const label = wide ? '宽泛匹配' : hit ? '完整消息匹配' : '关键词相关'
            if (hit) {
              direct++
              if (wide) broad++
            } else nearby++
            blocks.push({ rank: wide ? 2 : hit ? 0 : 1, text: ruleText(record, label, state.notes) })
          }
          blocks.sort((a, b) => a.rank - b.rank)
          blocks = blocks.map(item => item.text)
          title = `「${query}」· ${direct}条匹配（含${broad}条宽泛规则）${mode === 'exact' ? '' : ` · ${nearby}条相关`}`
          if (!blocks.length) blocks.push(result.incomplete || result.errors.length ? '本次查询未完成，请稍后再试' : `没有找到「${query}」的${mode === 'exact' ? '匹配规则' : '相关指令'}\n查看目录：#指令`)
          if (result.incomplete || result.errors.length) {
            blocks.unshift('本次仅展示已完成的查询结果，请稍后再试')
            globalThis.logger?.warn?.(`[指令帮助] 匹配不完整: checked=${result.checked.size}/${catalog.rules.length}, errors=${JSON.stringify(result.errors)}`)
          }
        }
      }
      if (catalog.unavailable) {
        blocks.unshift('部分插件暂未提供指令目录')
        globalThis.logger?.warn?.(`[指令帮助] ${catalog.unavailable} 个加载器条目没有可读取的已加载实例`)
      }
      await sendPage(e, blocks, title, page, e.msg)
    } catch (error) {
      globalThis.logger?.error?.(`[指令帮助] 查询失败: ${error.stack || error}`)
      await e.reply('指令查询暂不可用，请稍后再试')
    }
    return true
  }
}
