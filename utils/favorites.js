import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const defaultFile = fileURLToPath(new URL('../../../data/command-help-plugin/favorites.json', import.meta.url))
const queuesKey = Symbol.for('command-help-plugin.favorite-queues')
const queues = globalThis[queuesKey] ||= new Map()
const businessError = message => Object.assign(new Error(message), { userMessage: message })
const validOwner = owner => typeof owner === 'string' && /^[\w.-]{1,64}:[\w.-]{1,64}$/.test(owner)
const validItem = item => item && typeof item.id === 'string' && typeof item.group === 'string' && item.group.length <= 120 && typeof item.command === 'string' && item.command.length > 0 && item.command.length <= 200 && typeof item.createdAt === 'string'

export function createFavoritesStore({ file = defaultFile, limit = 50 } = {}) {
  file = path.resolve(file)
  const read = async () => {
    try {
      const stat = await fs.stat(file)
      if (stat.size > 8 * 1024 * 1024) throw businessError('收藏文件过大，请联系主人处理。')
      const data = JSON.parse(await fs.readFile(file, 'utf8'))
      if (data?.version !== 1 || !data.users || typeof data.users !== 'object' || Array.isArray(data.users) || !Object.entries(data.users).every(([owner, items]) => validOwner(owner) && Array.isArray(items) && items.every(validItem))) throw new Error('invalid favorites data')
      return data
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, users: {} }
      if (error.userMessage) throw error
      globalThis.logger?.error?.(`[指令帮助] 收藏读取失败: ${error.message}`)
      throw businessError('收藏文件暂时无法读取，已保留原文件，请联系主人检查。')
    }
  }
  const write = async data => {
    const body = JSON.stringify(data, null, 2)
    if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw businessError('收藏空间已满，请联系主人处理。')
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temp, body, { mode: 0o600, flag: 'wx' })
      await fs.rename(temp, file)
    } catch (error) {
      await fs.unlink(temp).catch(() => {})
      globalThis.logger?.error?.(`[指令帮助] 收藏保存失败: ${error.message}`)
      throw businessError('收藏保存失败，请稍后再试。')
    }
  }
  const run = (owner, operation) => {
    if (!validOwner(owner)) return Promise.reject(businessError('当前会话暂不支持收藏。'))
    const previous = queues.get(file) || Promise.resolve()
    const task = previous.catch(() => {}).then(async () => operation(await read()))
    const tail = task.catch(() => {})
    queues.set(file, tail)
    tail.finally(() => { if (queues.get(file) === tail) queues.delete(file) })
    return task
  }
  return {
    list: owner => run(owner, data => (data.users[owner] || []).map(item => ({ ...item }))),
    add: (owner, item) => run(owner, async data => {
      if (!item || typeof item.command !== 'string' || !item.command.trim() || item.command.length > 200 || typeof item.group !== 'string' || !item.group || item.group.length > 120) throw businessError('请收藏目录中的指令名称，长度不超过200字。')
      const items = data.users[owner] || []
      const existing = items.find(value => value.command === item.command.trim() && value.group === item.group)
      if (existing) return { kind: 'exists', item: existing }
      if (items.length >= limit) return { kind: 'full', limit }
      const entry = { id: randomUUID(), command: item.command.trim(), group: item.group, createdAt: new Date().toISOString() }
      items.push(entry); data.users[owner] = items
      await write(data)
      return { kind: 'added', item: entry }
    }),
    remove: (owner, idOrIndex) => run(owner, async data => {
      const items = data.users[owner] || []
      const index = typeof idOrIndex === 'number' ? idOrIndex - 1 : items.findIndex(item => item.id === idOrIndex)
      if (!Number.isInteger(index) || index < 0 || index >= items.length) return { kind: 'missing' }
      const [item] = items.splice(index, 1)
      if (!items.length) delete data.users[owner]
      await write(data)
      return { kind: 'removed', item }
    }),
  }
}
export const favoritesStore = createFavoritesStore()
