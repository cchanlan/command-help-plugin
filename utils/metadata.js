import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandNames } from './commands.js'

const pluginsRoot = fileURLToPath(new URL('../../', import.meta.url))
const cache = new Map()
const text = (value, max) => typeof value === 'string' ? [...value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()].slice(0, max).join('') : ''
const strings = (value, max, length) => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, max).map(item => text(item, length)).filter(Boolean) : []

async function load(folder) {
  const root = path.resolve(pluginsRoot, folder), relative = path.relative(pluginsRoot, root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return { error: true, items: [] }
  const file = path.join(root, 'command-help.json')
  try {
    const stat = await fs.stat(file), signature = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
    const cached = cache.get(folder)
    if (cached?.signature === signature) return cached.value
    if (stat.size > 256 * 1024) throw new Error('帮助资料超过256KB')
    const data = JSON.parse(await fs.readFile(file, 'utf8'))
    if (data.version !== 1 || !Array.isArray(data.commands) || data.commands.length > 300) throw new Error('帮助资料格式或条目数量不正确')
    const value = { error: false, items: data.commands }
    if (cache.size >= 100 && !cache.has(folder)) cache.delete(cache.keys().next().value)
    cache.set(folder, { signature, value })
    return value
  } catch (error) {
    if (error.code === 'ENOENT') { cache.delete(folder); return { error: false, items: [] } }
    globalThis.logger?.warn?.(`[指令帮助] 帮助资料不可用 ${folder}: ${error.message}`)
    return { error: true, items: [] }
  }
}

/** 帮助资料只能补充已经注册的规则，不能新增可执行规则或修改权限。 */
export async function enrichMetadata(catalog) {
  const warnings = new Set()
  for (const record of catalog.rules) delete record.metadata
  for (const group of catalog.groups) {
    const data = await load(group.folder)
    if (data.error) warnings.add(group.folder)
    for (const [order, item] of data.items.entries()) {
      if (!item || typeof item !== 'object' || !item.match || typeof item.match !== 'object') { warnings.add(group.folder); continue }
      const selector = item.match
      const keys = ['fnc', 'source', 'flags', 'key', 'command'].filter(key => typeof selector[key] === 'string')
      if (!keys.some(key => key !== 'flags')) { warnings.add(group.folder); continue }
      const matches = group.rules.filter(record => !record.internalExpanded && keys.every(key => {
        if (key === 'fnc') return (typeof record.rule.fnc === 'string' ? record.rule.fnc : record.rule.fnc?.name) === selector[key]
        if (key === 'command') return (record.commands || commandNames(record.source, record.flags)).commands.includes(selector[key])
        return record[key] === selector[key]
      }))
      if (matches.length !== 1) { warnings.add(group.folder); continue }
      matches[0].metadata = {
        order, title: text(item.title, 64), description: text(item.description, 300), category: text(item.category, 40),
        usage: text(item.usage, 200), examples: strings(item.examples, 3, 200), aliases: strings(item.aliases, 12, 40),
      }
    }
  }
  catalog.metadataWarnings = [...warnings]
  return catalog
}
