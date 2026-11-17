import { snapshot, searchable, status } from './catalog.js'
import { commandNames } from './commands.js'
import { enrichDescriptions } from './sourceDescriptions.js'
import { expandInternalRules } from './internalRules.js'

const states = new WeakMap(), identities = new WeakMap()
let nextIdentity = 0, nextVersion = 0
const identify = value => {
  if (!value || !['object','function'].includes(typeof value)) return String(value)
  if (!identities.has(value)) identities.set(value, ++nextIdentity)
  return identities.get(value)
}

/** 只读轻量签名：包含实例/类身份、顺序、动态规则、权限、事件和说明。
 * 不需要框架专属重载事件，Yunzai/JiuLi 增删改规则均在下一次查询生效。
 */
export function registrySignature(loader) {
  if (!Array.isArray(loader.priority)) throw new Error('加载器未提供注册表')
  return JSON.stringify(loader.priority.map(entry => {
    const instance = entry.plugin || {}
    return [entry.key, entry.name, identify(entry.class), identify(instance), String(entry.priority), instance.event, instance.dsc, instance.desc, instance.description,
      (Array.isArray(instance.rule) ? instance.rule : []).map(rule => [identify(rule), rule.reg instanceof RegExp ? rule.reg.source : String(rule.reg), rule.reg?.flags || '', identify(rule.fnc), rule.event, rule.permission, rule.dsc, rule.desc, rule.describe, rule.description])]
  }))
}

export async function getCatalog(loader) {
  const signature = registrySignature(loader)
  let state = states.get(loader)
  if (!state || state.signature !== signature || state.expires < Date.now()) {
    state = { signature, expires: Date.now() + 30000 }
    state.promise = (async () => {
      const catalog = await expandInternalRules(snapshot(loader))
      await enrichDescriptions(catalog.rules)
      for (const record of catalog.rules) {
        const names = commandNames(record.source, record.flags)
        record.commands = names
        record.searchText = [searchable(record.source), record.description, record.sourceDescription, ...names.commands].join(' ').toLowerCase()
      }
      catalog.version = ++nextVersion
      catalog.createdAt = Date.now()
      return catalog
    })().catch(error => { if (states.get(loader) === state) states.delete(loader); throw error })
    states.set(loader, state)
  }
  return state.promise
}

/** 普通用户的目录只显示当前有可用消息规则的插件；主人目录保留全部。 */
export function visibleCatalog(catalog, e, loader) {
  if (e.isMaster) return catalog
  const rules = catalog.rules.filter(record => status(record, e, loader).eligible)
  const ids = new Set(rules.map(record => record.group))
  return { ...catalog, rules, groups: catalog.groups.filter(group => ids.has(group.folder)).map(group => ({ ...group, rules: rules.filter(record => record.group === group.folder) })) }
}

export function clearIndex(loader) { states.delete(loader) }
