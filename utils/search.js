import { commandNames } from './commands.js'

const synonyms = [['签到', '打卡'], ['帮助', 'help'], ['绑定', 'bind']]
export const normalizeSearch = value => String(value || '').normalize('NFKC').toLowerCase().replace(/^[#＃*＊]+/, '').replace(/\s+/g, ' ').trim()
const namesOf = record => record.commands?.commands || commandNames(record.source, record.flags).commands
const wordsOf = query => normalizeSearch(query).split(' ').filter(Boolean).slice(0, 12)
const alternatives = word => synonyms.find(group => group.includes(word)) || [word]

export function scoreRecord(record, query) {
  const words = wordsOf(query)
  if (!words.length) return 0
  const names = namesOf(record).map(normalizeSearch)
  const aliases = (record.metadata?.aliases || []).map(normalizeSearch)
  const descriptions = [record.description, record.sourceDescription, record.metadata?.title, record.metadata?.description, record.metadata?.usage, record.searchText, record.source].map(normalizeSearch).join(' ')
  const fields = [...names, ...aliases, descriptions]
  if (!words.every(word => alternatives(word).some(term => fields.some(field => field.includes(term))))) return 0
  const whole = normalizeSearch(query)
  let score = names.includes(whole) ? 1000 : aliases.includes(whole) ? 900 : names.some(name => name.startsWith(whole)) ? 750 : names.some(name => name.includes(whole)) ? 650 : 100
  for (const word of words) {
    if (names.some(name => name.includes(word))) score += 80
    else if (aliases.some(name => name.includes(word))) score += 50
    else if (alternatives(word).some(term => names.some(name => name.includes(term)))) score += 30
  }
  return score
}

export function rankRecords(records, query, includeUnrelated = false) {
  return records.map((record, index) => ({ record, index, score: scoreRecord(record, query) }))
    .filter(item => includeUnrelated || item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.record)
}

function distance(a, b, max) {
  const left = [...a], right = [...b]
  if (Math.abs(left.length - right.length) > max) return max + 1
  let row = Array.from({ length: right.length + 1 }, (_, i) => i)
  for (let i = 1; i <= left.length; i++) {
    const next = [i]
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1))
    if (Math.min(...next) > max) return max + 1
    row = next
  }
  return row[right.length]
}

export function suggestCommands(records, query, limit = 3) {
  const word = normalizeSearch(query)
  if (word.length < 2 || word.length > 24 || /\s|\d{5}|[=:/@]/.test(word)) return []
  const found = [], seen = new Set(), max = word.length <= 5 ? 1 : 2
  let checked = 0
  for (const record of records) {
    if (record.internalExpanded) continue
    for (const command of namesOf(record)) {
      if (++checked > 6000) break
      const name = normalizeSearch(command), key = JSON.stringify([record.group, command])
      if (seen.has(key) || name.length > 30 || name === word) continue
      seen.add(key)
      const cost = distance(word, name, max)
      if (cost <= max) found.push({ command, group: record.group, cost })
    }
    if (checked > 6000) break
  }
  return found.sort((a, b) => a.cost - b.cost || a.command.length - b.command.length).slice(0, Math.min(5, limit)).map(({ command, group }) => ({ command, group }))
}
