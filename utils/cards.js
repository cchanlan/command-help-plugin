import { commandNames } from './commands.js'
import { ruleDetails } from './details.js'
import { pageCommand } from './output.js'

export const CARD_PAGE_SIZE = 6
export function pluginCardData(records, { title = '插件指令', page = 1, original = '#指令', master = false } = {}) {
  const entries = [], seen = new Set()
  for (const record of records) {
    if (record.internalExpanded) continue
    const extracted = record.commands || commandNames(record.source, record.flags)
    const names = [...new Set(extracted.commands)].filter(Boolean)
    if (!names.length && !record.metadata?.usage) continue
    const key = JSON.stringify([record.group, record.source, record.flags, record.rule.fnc?.name || record.rule.fnc, names, record.event, record.rule.permission])
    if (seen.has(key)) continue
    seen.add(key)
    const details = ruleDetails(record), meta = record.metadata || {}
    const category = meta.category || record.name?.replace(/^[\[【][^\]】]+[\]】]\s*/, '') || '常用功能'
    entries.push({
      order: meta.order ?? Infinity, category, title: meta.title || names[0] || '指令用法', command: meta.usage || names[0],
      description: meta.description || details.description, examples: meta.examples || [],
      aliases: names.slice(1, 5), moreAliases: Math.max(0, names.length - 5),
      uncertain: Boolean(extracted.uncertain || extracted.limited),
      notes: master ? record.availability?.notes || [] : [],
      priority: master ? details.priorityText : '',
    })
  }
  entries.sort((a, b) => a.order - b.order)
  const grouped = new Map()
  for (const entry of entries) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, [])
    grouped.get(entry.category).push(entry)
  }
  const ordered = [...grouped.values()].flat()
  const pages = Math.max(1, Math.ceil(ordered.length / CARD_PAGE_SIZE))
  const validPage = Number.isSafeInteger(page) && page >= 1 && page <= pages
  const cards = validPage ? ordered.slice((page - 1) * CARD_PAGE_SIZE, page * CARD_PAGE_SIZE) : []
  const categories = []
  for (const card of cards) {
    if (categories.at(-1)?.title !== card.category) categories.push({ title: card.category, cards: [] })
    categories.at(-1).cards.push(card)
  }
  const plainQuery = String(original).replace(/^#指令文字/, '#指令').replace(/(?:^|\s)第[1-9]\d*页$/, '').trim()
  return { kind: 'plugin', title, total: ordered.length, page, pages, validPage, categories, cards,
    nextCommand: page < pages ? pageCommand(original, page + 1) : '',
    textCommand: plainQuery.replace(/^#指令\s*/, '#指令文字 '),
  }
}

export async function sendCardText(e, data) {
  const text = [`${data.title} · 第${data.page}/${data.pages}页`, ...data.cards.map(card => [card.title, card.command,
    card.description, card.examples.length ? `示例：${card.examples.join(' / ')}` : '',
    card.aliases.length ? `别名：${card.aliases.join(' / ')}${card.moreAliases ? ' 等' : ''}` : '',
    card.notes.length ? `适用：${card.notes.join('；')}` : '',
  ].filter(Boolean).join('\n')), data.nextCommand ? `下一页：${data.nextCommand}` : '', `完整文字：${data.textCommand}`].filter(Boolean).join('\n\n')
  const points = [...text]
  for (let start = 0; start < points.length; start += 1600) await e.reply(points.slice(start, start + 1600).join(''))
}
