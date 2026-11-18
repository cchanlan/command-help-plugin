import plugin from '../../../lib/plugins/plugin.js'
import loader from '../../../lib/plugins/loader.js'
import { visibleRules } from '../utils/catalog.js'
import { getCatalog, visibleCatalog } from '../utils/searchIndex.js'
import { matchRules } from '../utils/matcher.js'
import { helpText, parseQuery, commandBlocks, conflictBlocks, sendPage, pageCommand } from '../utils/output.js'
import { replyHelpImage, replyPluginImage, imageData } from '../utils/render.js'
import { pluginCardData, sendCardText } from '../utils/cards.js'
import { updatePlugin } from '../utils/updater.js'
import { resolveScope } from '../utils/scope.js'
import { rankRecords, scoreRecord, suggestCommands, normalizeSearch } from '../utils/search.js'
import { commandNames } from '../utils/commands.js'
import { favoritesStore } from '../utils/favorites.js'
import { statusText } from '../utils/status.js'
export { resolveScope } from '../utils/scope.js'

const namesOf = record => (record.commands || commandNames(record.source, record.flags)).commands
const favoriteRecord = (records, item) => records.find(record => record.availability.eligible && !record.internalExpanded && (!item.group || item.group === record.group) && namesOf(record).includes(item.command))

export class CommandHelp extends plugin {
  constructor() {
    super({
      name: '指令帮助', dsc: '插件指令卡片、关键词检索、命令测试与常用收藏',
      event: 'message', priority: -501,
      rule: [
        { reg: /^#指令更新$/, fnc: 'update', desc: '更新指令帮助插件', permission: 'master' },
        { reg: /^#指令状态$/, fnc: 'health', desc: '查看目录覆盖情况和出图状态', permission: 'master' },
        { reg: /^#指令刷新$/, fnc: 'refresh', desc: '刷新目录与帮助资料', permission: 'master' },
        { reg: /^#(?:指令收藏|常用指令)(?:\s|$)/, fnc: 'favorites', desc: '查看或添加自己的常用指令' },
        { reg: /^#取消收藏(?:\s|$)/, fnc: 'removeFavorite', desc: '按序号取消自己的收藏' },
        { reg: /^#指令文字/, fnc: 'text', desc: '查看可复制的完整文字指令' },
        { reg: /^#指令冲突/, fnc: 'conflict', desc: '查看规则匹配顺序与候选冲突' },
        { reg: /^#(?:指令|指令列表|指令总览|指令帮助|指令help)/, fnc: 'lookup', desc: '查看插件目录或搜索指令' },
        { reg: /^#测试命令/, fnc: 'test', desc: '只匹配完整消息，不执行命令' },
      ],
    })
  }
  async lookup(e) { return this.handle(e, '#指令') }
  async text(e) { return this.handle(e, '#指令文字') }
  async test(e) { return this.handle(e, '#测试命令') }
  async conflict(e) { return this.handle(e, '#指令冲突') }

  async update(e) {
    if (!e.isMaster) return true
    const task = updatePlugin()
    if (task.kind === 'busy') { await e.reply('更新正在进行中，请稍后查看。'); return true }
    await e.reply('正在更新指令帮助插件。')
    const result = await task.promise
    if (result.kind === 'updated') await e.reply(`指令帮助插件已更新至 ${result.to.slice(0, 7)}。`)
    else if (result.kind === 'current') await e.reply('指令帮助插件已是最新版本。')
    else await e.reply(result.message || '更新未完成，请稍后再试。')
    return true
  }

  async health(e) {
    if (!e.isMaster) return true
    try { await e.reply(statusText(await getCatalog(loader))) }
    catch (error) { globalThis.logger?.error?.(`[指令帮助] 状态读取失败: ${error.stack || error}`); await e.reply('状态暂时无法读取，请稍后再试。') }
    return true
  }
  async refresh(e) {
    if (!e.isMaster) return true
    try { const catalog = await getCatalog(loader, { force: true }); await e.reply(`已刷新 ${catalog.groups.length} 个插件的目录与帮助资料。`) }
    catch (error) { globalThis.logger?.error?.(`[指令帮助] 刷新失败: ${error.stack || error}`); await e.reply('目录刷新失败，请稍后再试。') }
    return true
  }

  owner(e) { return `${e.self_id || e.bot?.uin || ''}:${e.user_id || ''}` }
  async favorites(e) {
    try {
      const prefix = e.msg.startsWith('#常用指令') ? '#常用指令' : '#指令收藏'
      const query = e.msg.slice(prefix.length).trim()
      const catalog = await getCatalog(loader), records = visibleRules(catalog.rules, e, loader)
      if (!query || /^第[1-9]\d*页$/.test(query)) {
        const items = await favoritesStore.list(this.owner(e))
        if (!items.length) { await e.reply('还没有收藏。发送：#指令收藏 <目录里的指令名称>\n例如：#指令收藏 #指令帮助'); return true }
        const blocks = items.map((item, index) => favoriteRecord(records, item) ? `${index + 1}. ${item.command}\n来源：${item.group}` : `${index + 1}. 该收藏当前不可用\n可发送：#取消收藏 ${index + 1}`)
        blocks.push('添加：#指令收藏 <指令名称>\n取消：#取消收藏 <序号>\n仅收藏指令入口，不附账号、令牌或其他参数。')
        await sendPage(e, blocks, '我的常用指令', parseQuery(e.msg, prefix).page, prefix)
      } else {
        if (query.length > 200) { await e.reply('收藏的指令名称请控制在200字以内。'); return true }
        const record = favoriteRecord(records, { command: query })
        if (!record) { await e.reply('当前会话没有找到可收藏的同名指令。请从插件目录复制指令名称，不附账号、令牌或其他参数。'); return true }
        const command = namesOf(record).find(name => name === query)
        const result = await favoritesStore.add(this.owner(e), { command, group: record.group })
        await e.reply(result.kind === 'added' ? `已收藏：${command}\n查看：#常用指令` : result.kind === 'exists' ? '这条指令已经收藏了。' : `最多收藏${result.limit}条，请先取消不再使用的收藏。`)
      }
    } catch (error) { globalThis.logger?.error?.(`[指令帮助] 收藏处理失败: ${error.message}`); await e.reply(error.userMessage || '收藏暂不可用，请稍后再试。') }
    return true
  }
  async removeFavorite(e) {
    try {
      const value = e.msg.slice('#取消收藏'.length).trim()
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) { await e.reply('请发送：#取消收藏 <序号>\n先用 #常用指令 查看序号。'); return true }
      const result = await favoritesStore.remove(this.owner(e), Number(value))
      await e.reply(result.kind === 'removed' ? '已取消该收藏。' : '没有这个收藏序号，请用 #常用指令 查看。')
    } catch (error) { globalThis.logger?.error?.(`[指令帮助] 取消收藏失败: ${error.message}`); await e.reply(error.userMessage || '收藏暂不可用，请稍后再试。') }
    return true
  }

  async handle(e, prefix) {
    const { query, page, mode } = parseQuery(e.msg, prefix), textOnly = prefix === '#指令文字'
    if (query.length > 200) { await e.reply('查询内容请控制在200字以内'); return true }
    try {
      if (mode === 'auto' && ['帮助', 'help'].includes(query.toLowerCase())) {
        if (textOnly || !await replyHelpImage(e, 'help')) await e.reply(helpText)
        return true
      }
      if (['exact', 'conflict'].includes(mode) && !query) { await e.reply(mode === 'exact' ? '请发送：#测试命令#绑定' : '请发送：#指令冲突 #绑定'); return true }
      const fullCatalog = await getCatalog(loader), catalog = visibleCatalog(fullCatalog, e, loader)
      let blocks = [], title
      if (mode === 'auto' && ['', '列表', '总览', '插件'].includes(query)) {
        const data = imageData('directory', catalog, page)
        if (!data.validPage) { await e.reply(`共${data.pages}页，请发送：${pageCommand(e.msg, data.pages)}`); return true }
        if (!textOnly && await replyHelpImage(e, 'directory', catalog, page)) return true
        await e.reply([`插件指令目录 · 第${data.page}/${data.pages}页`, ...data.plugins.map(item => `${item.name}：${item.command}`), data.nextCommand ? `下一页：${pageCommand(e.msg, page + 1)}` : '使用帮助：#指令帮助'].join('\n'))
        return true
      }
      const scope = ['auto', 'plugin'].includes(mode) ? resolveScope(catalog.groups, query, mode === 'plugin') : { groups: [], keyword: query }
      if (scope.groups.length && !scope.keyword) {
        const records = visibleRules(scope.groups.flatMap(group => group.rules), e, loader)
        title = scope.groups.map(group => group.displayName || group.folder).join(' / ')
        if (!textOnly) {
          const data = pluginCardData(records, { title, page, original: e.msg, master: e.isMaster })
          if (!data.validPage) { await e.reply(`共${data.pages}页，请发送：${pageCommand(e.msg, data.pages)}`); return true }
          if (!await replyPluginImage(e, data)) await sendCardText(e, data)
          return true
        }
        blocks = commandBlocks(records)
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
        const multiWord = normalizeSearch(word).split(' ').filter(Boolean).length > 1
        for (const record of records) {
          const hit = result.matched.has(record.id), relevant = scoreRecord(record, word) > 0
          if (multiWord && !['exact', 'conflict'].includes(mode) && !relevant) continue
          if (!hit && (['exact', 'conflict'].includes(mode) || !relevant)) continue
          if (result.broad.has(record.id)) {
            if (['exact', 'conflict'].includes(mode)) broad.push(record)
            else if (relevant) nearby.push(record)
          } else if (hit) direct.push(record)
          else nearby.push(record)
        }
        if (mode === 'conflict') {
          blocks = conflictBlocks(records.filter(record => result.matched.has(record.id)), normalized, result.broad)
          title = `冲突诊断：${word}`
        } else {
          const seen = new Set(), options = mode === 'exact' ? { exactText: normalized } : {}
          blocks = [...commandBlocks(rankRecords(direct, word, true), '匹配指令', word, seen, options), ...commandBlocks(rankRecords(nearby, word), '相关指令', word, seen)]
          if (broad.length) blocks.push(`其他消息响应插件\n${[...new Set(broad.filter(record => !record.internalExpanded).map(record => record.group))].join('、') || '暂无'}`)
          title = scope.groups.length ? `插件内搜索：${scope.groups.map(group => group.folder).join('、')} · ${word}` : `搜索：${word}`
        }
        if (!blocks.length) {
          blocks.push(result.incomplete || result.errors.length ? '本次查询未完成，请稍后再试' : '当前会话没有找到相关指令')
          if (!['exact', 'conflict'].includes(mode) && !result.incomplete && !result.errors.length) {
            const suggestions = suggestCommands(records, word)
            if (suggestions.length) blocks.push(`你可能要找：\n${suggestions.map(item => `${item.command}（${item.group}）`).join('\n')}`)
          }
        }
        if (result.incomplete || result.errors.length) { blocks.unshift('本次仅展示已完成的查询结果，请稍后再试'); globalThis.logger?.warn?.(`[指令帮助] 匹配不完整 ${result.checked.size}/${records.length}: ${JSON.stringify(result.errors)}`) }
      }
      if (fullCatalog.unavailable) blocks.unshift('部分插件暂未提供指令目录')
      if (fullCatalog.internalWarnings?.length && e.isMaster) blocks.unshift('部分插件的内部指令暂未展开')
      await sendPage(e, blocks, title, page, e.msg)
    } catch (error) { globalThis.logger?.error?.(`[指令帮助] 查询失败: ${error.stack || error}`); await e.reply('指令查询暂不可用，请稍后再试') }
    return true
  }
}
