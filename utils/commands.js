/** 从规则提取简明指令名称，不生成参数示例，不执行正则或插件代码。
 * 参数被省略，所以这些是帮助条目，不保证不带参数就能直接执行。
 */
const LIMIT = 256
const CACHE = new Map()

export function commandNames(source, flags = '') {
  const key = JSON.stringify([source, flags])
  const cached = CACHE.get(key)
  if (cached) return cached
  const cacheKey = key
  // 常见大小写/可选拼写只保留通用名称，不展示 cook、ckie 这类机械组合。
  source = source.replace(/([cC])\(([oO]{2})\)\?([kK])\(([iI][eE])\)\?/g, (_, c, oo, k, ie) => '(' + c + oo + k + ie + '|' + c + k + ')')
  let cursor = 0, depth = 0, limited = false, uncertain = false
  const unique = values => [...new Set(values)]
  const bounded = values => {
    const result = unique(values)
    if (result.length > LIMIT) limited = true
    return result.slice(0, LIMIT)
  }
  const product = (left, right) => {
    const result = []
    for (const a of left) for (const b of right) {
      result.push(a + b)
      if (result.length > LIMIT * 2) { limited = true; return bounded(result) }
    }
    return bounded(result)
  }
  const escape = () => {
    const ch = source[cursor++] || ''
    if (ch === 'u' || ch === 'x') {
      const braced = source[cursor] === '{'
      const start = cursor + (braced ? 1 : 0)
      const end = braced ? source.indexOf('}', start) : start + (ch === 'u' ? 4 : 2)
      const hex = source.slice(start, end)
      if (end >= start && /^[0-9a-f]+$/i.test(hex)) {
        const code = parseInt(hex, 16)
        if (code <= 0x10ffff) { cursor = end + (braced ? 1 : 0); return String.fromCodePoint(code) }
      }
      uncertain = true
      return ''
    }
    if (ch === 'p' || ch === 'P') {
      if (source[cursor] === '{') { const end = source.indexOf('}', cursor); cursor = end < 0 ? source.length : end + 1 }
      return ''
    }
    if (ch === 'k' && source[cursor] === '<') { const end = source.indexOf('>', cursor); cursor = end < 0 ? source.length : end + 1; uncertain = true; return '' }
    if (/[1-9]/.test(ch)) { while (/[0-9]/.test(source[cursor] || 'X')) cursor++; uncertain = true; return '' }
    if ('sntrf'.includes(ch)) return ' '
    if ('dDwWSbB0'.includes(ch)) return ''
    return ch
  }
  const sequence = stop => {
    if (++depth > 48) throw new Error('正则嵌套过深')
    const alternatives = []
    let values = ['']
    while (cursor < source.length && source[cursor] !== stop) {
      const ch = source[cursor++]
      if (ch === '|') { alternatives.push(...values); values = ['']; continue }
      let atom = [''], suppress = false
      if (ch === '(') {
        const groupStart = cursor
        if (source[cursor] === '?') {
          cursor++
          if (source[cursor] === ':') cursor++
          else if (source[cursor] === '=' || source[cursor] === '!') { cursor++; suppress = true }
          else if (source[cursor] === '<') {
            cursor++
            if (source[cursor] === '=' || source[cursor] === '!') { cursor++; suppress = true }
            else { const end = source.indexOf('>', cursor); if (end < 0) throw new Error('捕获组不完整'); cursor = end + 1 }
          } else throw new Error('暂不支持的分组')
        }
        atom = sequence(')')
        if (source[cursor] !== ')') throw new Error('分组不完整')
        const groupSource = source.slice(groupStart, cursor)
        cursor++
        if (suppress || (atom.every(v => /^[0-9 +]*$/.test(v)) && (groupSource.includes('[') || groupSource.includes(String.fromCharCode(92) + 'd')))) atom = ['']
      } else if (ch === '[') {
        const items = []
        let dynamic = false
        if (source[cursor] === '^') { dynamic = true; cursor++ }
        while (cursor < source.length && source[cursor] !== ']') {
          const part = source[cursor++]
          if (part.charCodeAt(0) === 92) {
            const before = cursor
            const value = escape()
            if (!value || value === ' ') dynamic = true
            if (cursor === before) throw new Error('字符类转义不完整')
            items.push(value)
          } else if (part === '-') dynamic = true
          else items.push(part)
        }
        if (source[cursor] !== ']') throw new Error('字符类不完整')
        cursor++
        const variants = unique(items.map(v => flags.includes('i') ? v.toLowerCase() : v))
        atom = dynamic || variants.length > 12 || variants.every(v => /^[0-9]$/.test(v)) ? [''] : variants
      } else if (ch.charCodeAt(0) === 92) atom = [escape()]
      else if (ch !== '^' && ch !== '$' && ch !== '.') atom = [ch]
      let min = 1, max = 1, quantified = true
      if (source[cursor] === '?') { min = 0; max = 1; cursor++ }
      else if (source[cursor] === '*') { min = 0; max = Infinity; cursor++ }
      else if (source[cursor] === '+') { max = Infinity; cursor++ }
      else if (source[cursor] === '{') {
        const match = source.slice(cursor).match(/^\{(\d+)(?:,(\d*)?)?\}/)
        if (match) {
          min = Number(match[1]); max = match[0].includes(',') ? Number(match[2] || Infinity) : min
          cursor += match[0].length
        } else quantified = false
      } else quantified = false
      if (quantified && source[cursor] === '?') cursor++
      if (min > 1 && min === max && min <= 4) atom = atom.map(v => v.repeat(min))
      // 帮助展示代表写法，不把可省略空格、id、强制等开关组合穷举成几十条。
      if (min === 0) {
        if (atom.includes('打开')) atom = ['打开']
        else if (atom.includes('#')) atom = ['#']
        else if (atom.some(v => ['原神', '星铁', '绝区零', '鸣潮'].includes(v))) atom = bounded([...atom.filter(v => !['zzz','mc','ys','xt'].includes(v)), ''])
        else atom = ['']
      }
      values = product(values, atom)
    }
    depth--
    return bounded([...alternatives, ...values])
  }
  let commands = []
  try {
    if (source.length > 200000) throw new Error('规则过长')
    commands = sequence(undefined)
      .map(value => value.replace(/\s+/g, ' ').trim().replace(/\[\]/g, ''))
      .filter(value => /[\p{L}\p{N}]/u.test(value))
    commands = unique(commands)
    // #? 或 #* 的省略前缀不重复列出；可选的文字别名仍保留。
    const all = new Set(commands)
    commands = commands.filter(value => /^[#*/]/.test(value) || !all.has('#' + value))
  } catch (error) {
    uncertain = true
    globalThis.logger?.debug?.(`[指令帮助] 简明名称提取失败: ${error.message}`)
  }
  const result = { commands, limited, uncertain }
  if (CACHE.size >= 4096) CACHE.delete(CACHE.keys().next().value)
  CACHE.set(cacheKey, result)
  return result
}
