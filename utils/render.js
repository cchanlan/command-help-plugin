import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { helpSections } from './helpContent.js'
import { brief } from './details.js'
import { directoryGroups, pluginLabel } from './pluginNames.js'
import { sendSucceeded } from './send.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const pluginName = path.basename(root.replace(/[\\/]$/, ''))
export function imageData(kind, catalog) {
  return {
    kind,
    title: kind === 'directory' ? '插件指令目录' : '指令使用帮助',
    intro: kind === 'directory' ? '按插件查找，发现更多功能。' : '指令帮助',
    outro: '随用随查，不必记住所有指令。',
    sections: helpSections,
    helpGroups: [
      { title: '常用入口', list: [helpSections[0], helpSections[1]] },
      { title: '查找指令', list: [helpSections[2], helpSections[3]] },
      { title: '匹配与诊断', list: [helpSections[4], helpSections[8]] },
      { title: '翻页与维护', list: [helpSections[5], helpSections[6], helpSections[7]] },
    ].map(group => ({ ...group, list: group.list.map(item => ({
      ...item,
      aliasList: item.aliases.split(' / '),
    })) })),
    plugins: kind === 'directory' ? directoryGroups(catalog).map(group => {
      const label = pluginLabel(group)
      return { name: brief(group.folder, 40), command: `#指令${label.query}` }
    }) : [],
  }
}

/** 固定两份 HTML 必须串行；超时后隔离未结束的截图，不冒险并发覆盖。
 * 熔断期间直接文字回退，底层截图真正结束才恢复服务。
 */
export function createImageService(render, { timeoutMs = 10000, ttlMs = 30000, capacity = 4 } = {}) {
  const pending = new Map(), cache = new Map(), queue = []
  let active = null
  const finish = (job, result) => {
    if (job.done) return
    job.done = true; clearTimeout(job.timer)
    if (pending.get(job.key) === job) pending.delete(job.key)
    job.resolve(result)
  }
  const pump = () => {
    if (active) return
    const job = queue.shift()
    if (!job) return
    if (job.done) { pump(); return }
    active = job
    Promise.resolve().then(() => render(job.kind, job.data)).then(image => {
      if (!job.done && image) {
        const bytes = image?.file?.byteLength || image?.data?.file?.byteLength || image?.byteLength || (typeof image?.file === 'string' ? image.file.length : 0)
        if (bytes > 0 && bytes <= 2 * 1024 * 1024) {
          if (cache.size >= 6) cache.delete(cache.keys().next().value)
          cache.set(job.key, { image, expires: Date.now() + ttlMs })
        }
      }
      finish(job, image || false)
    }).catch(error => {
      globalThis.logger?.warn?.(`[指令帮助] 出图失败: ${error.message}`)
      finish(job, false)
    }).finally(() => { active = null; pump() })
  }
  return (kind, data) => {
    const key = JSON.stringify([kind, data])
    const cached = cache.get(key)
    if (cached?.expires > Date.now()) return Promise.resolve(cached.image)
    if (cached) cache.delete(key)
    if (pending.has(key)) return pending.get(key).promise
    if (active?.done || pending.size >= capacity) return Promise.resolve(false)
    let resolve
    const promise = new Promise(done => { resolve = done })
    const job = { key, kind, data, promise, resolve, done: false }
    job.timer = setTimeout(() => {
      finish(job, false)
      if (active === job) {
        for (const waiting of queue.splice(0)) finish(waiting, false)
        globalThis.logger?.warn?.('[指令帮助] 截图超时，已回退文字，等待底层截图结束后恢复')
      } else { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1) }
    }, timeoutMs)
    pending.set(key, job); queue.push(job); pump()
    return promise
  }
}

const imageService = createImageService(async (kind, data) => {
  const renderer = (await import('../../../lib/puppeteer/puppeteer.js')).default
  if (typeof renderer?.screenshot !== 'function') return false
  return renderer.screenshot(`${pluginName}/help`, {
    ...data, tplFile: path.join(root, 'resources', 'help.html'), saveId: kind, imgType: 'png',
  })
})

export async function renderHelpImage(kind, catalog) {
  try { return await imageService(kind, imageData(kind, catalog)) }
  catch (error) { globalThis.logger?.warn?.(`[指令帮助] 出图数据错误: ${error.message}`); return false }
}

export async function replyHelpImage(e, kind, catalog) {
  const image = await renderHelpImage(kind, catalog)
  if (!image) return false
  try { return sendSucceeded(await e.reply(image)) }
  catch (error) { globalThis.logger?.warn?.(`[指令帮助] 图片发送失败: ${error.message}`); return false }
}
