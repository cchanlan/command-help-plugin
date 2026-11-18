import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginsRoot = fileURLToPath(new URL('../../', import.meta.url))
const UNKNOWN = Symbol('unknown')

/** 只解释白名单中的静态数据节点，不 import 目标插件、不 eval、不执行函数。 */
async function readTable(folder) {
  const { parse } = await import('../vendor/acorn/acorn.mjs')
  const root = await fs.realpath(path.join(pluginsRoot, folder))
  const loaded = new Map()
  const modules = async (file, depth = 0) => {
    const real = await fs.realpath(file)
    const relative = path.relative(root, real)
    if (relative.startsWith('..') || path.isAbsolute(relative) || depth > 6 || loaded.size >= 12) throw new Error('内部规则表超出静态读取范围')
    if (loaded.has(real)) return loaded.get(real)
    const stat = await fs.stat(real)
    if (stat.size > 1024 * 1024) throw new Error('内部规则表文件过大')
    const tree = parse(await fs.readFile(real, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' })
    const declarations = new Map(), imports = new Map(), exports = new Map(), values = new Map(), pending = new Set()
    const put = declaration => {
      if (declaration?.type === 'VariableDeclaration') for (const node of declaration.declarations) if (node.id.type === 'Identifier') declarations.set(node.id.name, node.init)
    }
    for (const node of tree.body) {
      put(node)
      if (node.type === 'ImportDeclaration' && node.source.value.startsWith('.')) for (const spec of node.specifiers) if (spec.type === 'ImportSpecifier') imports.set(spec.local.name, { file: path.resolve(path.dirname(real), node.source.value), name: spec.imported.name })
      if (node.type === 'ExportNamedDeclaration') {
        put(node.declaration)
        if (node.declaration?.type === 'VariableDeclaration') for (const item of node.declaration.declarations) exports.set(item.id.name, item.id.name)
        if (node.declaration?.id) exports.set(node.declaration.id.name, node.declaration.id.name)
        for (const spec of node.specifiers) exports.set(spec.exported.name, spec.local.name)
      }
    }
    const evaluate = async node => {
      if (!node) return UNKNOWN
      if (node.type === 'Literal') return node.value
      if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked
      if (node.type === 'Identifier') return resolve(node.name)
      if (node.type === 'ObjectExpression') {
        const object = Object.create(null)
        for (const property of node.properties) {
          if (property.type === 'SpreadElement') {
            const value = await evaluate(property.argument)
            if (!value || value === UNKNOWN || typeof value !== 'object') return UNKNOWN
            Object.assign(object, value)
          } else if (property.type === 'Property' && !property.computed && property.kind === 'init') {
            const key = property.key.name || property.key.value
            if (['__proto__','constructor','prototype'].includes(key)) return UNKNOWN
            const value = await evaluate(property.value)
            if (value === UNKNOWN) return UNKNOWN
            object[key] = value
          } else return UNKNOWN
        }
        return object
      }
      if (node.type === 'UnaryExpression' && node.operator === '-') { const value = await evaluate(node.argument); return typeof value === 'number' ? -value : UNKNOWN }
      return UNKNOWN
    }
    const resolve = async name => {
      if (values.has(name)) return values.get(name)
      if (pending.has(name)) return UNKNOWN
      pending.add(name)
      try {
        let value = UNKNOWN
        if (declarations.has(name)) value = await evaluate(declarations.get(name))
        else if (imports.has(name)) { const item = imports.get(name); value = await (await modules(item.file, depth + 1)).get(item.name) }
        values.set(name, value)
        return value
      } finally { pending.delete(name) }
    }
    const module = { get: name => exports.has(name) ? resolve(exports.get(name)) : UNKNOWN, exported: name => exports.has(name) }
    loaded.set(real, module)
    return module
  }
  const module = await modules(path.join(root, 'apps', 'index.js'))
  const table = await module.get('rule')
  if (!table || table === UNKNOWN || typeof table !== 'object') throw new Error('未找到可静态确认的内部规则表')
  return Object.entries(table).filter(([name]) => module.exported(name)).map(([fnc, rule]) => ({ ...rule, fnc }))
}

/** 显式适配 xiaoyao 的 Apps.rule 分发器；不猜测其他业务函数内部的条件分支。 */
export async function expandInternalRules(catalog) {
  const expanded = [], warnings = []
  for (const record of catalog.rules) {
    expanded.push(record)
    if (record.group !== 'xiaoyao-cvs-plugin' || record.rule.fnc !== 'dispatch') continue
    try {
      const dispatcher = record.entry.class?.prototype?.dispatch
      const source = typeof dispatcher === 'function' ? Function.prototype.toString.call(dispatcher) : ''
      if (!source.includes('Apps.rule') || !source.includes('Apps[fn]') || !source.includes('cfg.reg')) throw new Error('内部调度器形态不在已适配范围')
      const table = await readTable(record.group)
      if (!table.length || table.length > 500) throw new Error('内部规则表规模异常')
      const children = []
      for (const [index, rule] of table.entries()) {
        if (typeof rule.reg !== 'string' && !(rule.reg instanceof RegExp)) throw new Error('内部正则不是静态值')
        const regex = rule.reg instanceof RegExp ? rule.reg : new RegExp(rule.reg)
        children.push({ ...record, source: regex.source, flags: regex.flags, rule,
          description: String(rule.dsc || rule.desc || rule.describe || rule.description || ''),
          internal: true, parent: record, internalIndex: index, origin: 'xiaoyao Apps.rule',
        })
      }
      expanded.push(...children)
      record.internalExpanded = true
    } catch (error) {
      warnings.push(record.group)
      globalThis.logger?.warn?.(`[指令帮助] 内部规则未展开 ${record.group}: ${error.message}`)
    }
  }
  expanded.forEach((record, id) => { record.id = id })
  catalog.rules = expanded
  for (const group of catalog.groups) group.rules = expanded.filter(record => record.group === group.folder)
  catalog.internalWarnings = warnings
  return catalog
}
