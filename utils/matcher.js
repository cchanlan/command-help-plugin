import { Worker } from 'node:worker_threads'

let active = 0
// 隔离第三方正则，避免灾难性回溯卡死 bot。
const workerCode = `
;(async () => {
const { parentPort, workerData } = await import('node:worker_threads')
for (const record of workerData.rules) {
  try {
    const reg = new RegExp(record.source, record.flags)
    const test = text => { reg.lastIndex = 0; return reg.test(text) }
    let matched = false
    for (const text of workerData.texts) {
      if (test(text)) { matched = true; break }
    }
    const prefix = workerData.texts[0]?.startsWith('#') ? '#' : ''
    const broad = matched && (test('') || [prefix + 'QZXV8042UNRELATED', prefix + '完全无关测试词八零四二'].every(test))
    parentPort.postMessage({ id: record.id, matched, broad })
  } catch (error) { parentPort.postMessage({ id: record.id, error: error.message }) }
}
parentPort.postMessage({ done: true })
})()
`

export async function matchRules(rules, texts, timeout = 2500) {
  if (active >= 2) return { matched: new Set(), broad: new Set(), checked: new Set(), errors: [], incomplete: true, busy: true }
  active++
  try {
    return await new Promise(resolve => {
      const matched = new Set(), broad = new Set(), checked = new Set(), errors = []
      let settled = false, worker, timer
      const finish = incomplete => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // 等线程退出再释放并发名额。
        Promise.resolve(worker?.terminate()).catch(() => {}).then(() => resolve({ matched, broad, checked, errors, incomplete, busy: false }))
      }
      try {
        worker = new Worker(workerCode, {
          eval: true,
          workerData: { rules: rules.map(({ id, source, flags }) => ({ id, source, flags })), texts: [...new Set(texts)] },
          resourceLimits: { maxOldGenerationSizeMb: 64 },
        })
        timer = setTimeout(() => finish(true), timeout)
        worker.on('message', result => {
          if (result.done) return finish(false)
          checked.add(result.id)
          if (result.matched) matched.add(result.id)
          if (result.broad) broad.add(result.id)
          if (result.error) errors.push({ id: result.id, error: result.error })
        })
        worker.on('error', error => { errors.push({ error: error.message }); finish(true) })
        worker.on('exit', () => { if (!settled) finish(checked.size !== rules.length) })
      } catch (error) { errors.push({ error: error.message }); finish(true) }
    })
  } finally { active-- }
}
