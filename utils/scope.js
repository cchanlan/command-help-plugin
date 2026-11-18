import { findGroups, normalizeName } from './catalog.js'

/** 整名优先，再按最长插件名前缀识别「插件 关键词」。 */
export function resolveScope(groups, query, includeModules = false) {
  const exact = text => {
    const needle = normalizeName(text)
    const preferred = groups.filter(group => [group.displayName, group.queryName].some(name => name && normalizeName(name) === needle))
    if (preferred.length) return preferred
    return groups.filter(group => [...(includeModules ? group.names : group.aliases)].some(name => name && normalizeName(name) === needle))
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
