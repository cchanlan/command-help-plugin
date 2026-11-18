import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brief } from './details.js'

const pluginsRoot = fileURLToPath(new URL('../../', import.meta.url))
const cache = new Map()
const directories = new Set(['apps', 'app', 'utils', 'models', 'model', 'components', 'local', 'modules', 'host', 'adapter'])
let parserPromise

const textValue = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : ''
const nameOf = node => node?.name || textValue(node)
const remember = (map, key, text) => {
  if (!text) return
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(text)
}
const unambiguous = (map, key) => map.get(key)?.size === 1 ? [...map.get(key)][0] : ''

async function scanGroup(folder) {
  const root = path.resolve(pluginsRoot, folder)
  const relative = path.relative(pluginsRoot, root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  parserPromise ||= import('../vendor/acorn/acorn.mjs').then(module => module.parse).catch(error => {
    globalThis.logger?.warn?.(`[指令帮助] 源码说明解析不可用: ${error.message}`)
    return null
  })
  const parse = await parserPromise
  if (!parse) return null
  const rules = new Map(), regexes = new Map(), methods = new Map(), guards = new Set(), files = []
  const collect = async (dir, depth) => {
    if (files.length >= 250) return
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (files.length >= 250) break
      const full = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(full)
      else if (entry.isDirectory() && depth < 3 && (depth > 0 || directories.has(entry.name.toLowerCase()))) await collect(full, depth + 1)
    }
  }
  await collect(root, 0)
  let bytes = 0
  for (const file of files) {
    try {
      const stat = await fs.stat(file)
      if (stat.size > 1024 * 1024 || bytes + stat.size > 8 * 1024 * 1024) continue
      bytes += stat.size
      const source = await fs.readFile(file, 'utf8')
      const comments = []
      let tree
      try { tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, onComment: comments }) }
      catch { continue }
      const docBefore = node => {
        const comment = comments.filter(c => c.end <= node.start).pop()
        if (!comment || source.slice(comment.end, node.start).trim()) return ''
        const lines = comment.value.split('\n').map(line => line.replace(/^\s*\*?\s?/, '').trim()).filter(line => line && !line.startsWith('@'))
        return brief(lines[0], 2000)
      }
      const walk = (node, className = '') => {
        if (!node || typeof node !== 'object' || !node.type) return
        if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') className = node.id?.name || ''
        if (node.type === 'ObjectExpression') {
          const props = new Map(node.properties.filter(p => p.type === 'Property' && !p.computed).map(p => [nameOf(p.key), p.value]))
          const description = ['dsc', 'desc', 'describe', 'description'].map(key => brief(textValue(props.get(key)), 2000)).find(Boolean)
          const reg = props.get('reg')
          if (description && reg) {
            let sourceValue, flags = ''
            if (reg.regex) { sourceValue = reg.regex.pattern; flags = reg.regex.flags }
            else {
              const value = textValue(reg)
              if (value) try { sourceValue = new RegExp(value).source } catch {}
            }
            if (sourceValue !== undefined) {
              const fnc = textValue(props.get('fnc'))
              remember(rules, JSON.stringify([sourceValue, flags, fnc]), description)
              remember(regexes, JSON.stringify([sourceValue, flags]), description)
            }
          }
        }
        if (node.type === 'MethodDefinition' && className) {
          const key = JSON.stringify([className, nameOf(node.key)])
          remember(methods, key, docBefore(node))
          // 仅识别首句可证明的主人闸门，不猜任意自定义权限，也不调用方法。
          const first = node.value?.body?.body?.find(statement => !statement.directive)
          const test = first?.type === 'IfStatement' && first.test
          const member = test?.type === 'UnaryExpression' && test.operator === '!' && test.argument
          const object = member?.object
          const eventObject = object?.type === 'Identifier' && object.name === 'e' || object?.type === 'MemberExpression' && object.object?.type === 'ThisExpression' && object.property?.name === 'e'
          const branch = first?.consequent
          const returns = branch?.type === 'ReturnStatement' ? branch : branch?.type === 'BlockStatement' && branch.body.length === 1 ? branch.body[0] : null
          if (member?.type === 'MemberExpression' && !member.computed && member.property?.name === 'isMaster' && eventObject && returns?.type === 'ReturnStatement' && (!returns.argument || returns.argument.type === 'Literal' && returns.argument.value === false)) guards.add(key)
        }
        for (const [key, value] of Object.entries(node)) {
          if (key === 'start' || key === 'end') continue
          if (Array.isArray(value)) for (const child of value) walk(child, className)
          else if (value && typeof value === 'object' && value.type) walk(value, className)
        }
      }
      walk(tree)
    } catch (error) { globalThis.logger?.debug?.(`[指令帮助] 读取源码说明失败 ${folder}: ${error.message}`) }
  }
  return { rules, regexes, methods, guards }
}

/** 仅为已注册规则补说明；不导入其他插件，不执行源码。
 * 缓存跟随加载器实例身份；同实例内修改说明最多缓存 30 秒。
 */
export async function enrichDescriptions(records) {
  const groups = new Map()
  for (const record of records) {
    if (!groups.has(record.group)) groups.set(record.group, [])
    groups.get(record.group).push(record)
  }
  for (const [folder, list] of groups) {
    const owners = new Set(list.map(record => record.instance))
    let item = cache.get(folder)
    if (!item || item.expires < Date.now() || [...owners].some(owner => !item.owners.has(owner))) {
      item = { owners, expires: Date.now() + 30000, promise: scanGroup(folder) }
      if (cache.size >= 100 && !cache.has(folder)) cache.delete(cache.keys().next().value)
      cache.set(folder, item)
    }
    const data = await item.promise
    if (!data) continue
    for (const record of list) {
      const fnc = typeof record.rule?.fnc === 'string' ? record.rule.fnc : record.rule?.fnc?.name || ''
      const className = record.entry?.class?.name || record.instance?.constructor?.name || ''
      if (data.guards.has(JSON.stringify([className, fnc]))) record.sourcePermission = 'master'
      record.sourceDescription = unambiguous(data.rules, JSON.stringify([record.source, record.flags, fnc])) || unambiguous(data.regexes, JSON.stringify([record.source, record.flags])) || unambiguous(data.methods, JSON.stringify([className, fnc]))
    }
  }
  return records
}
