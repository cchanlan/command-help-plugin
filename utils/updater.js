import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFile = promisify(nodeExecFile)
const pluginRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const allowedOrigins = new Set([
  'https://gitcode.com/ccxhan/command-help-plugin',
  'https://github.com/cchanlan/command-help-plugin',
  'https://gitee.com/longhengmu/command-help-plugin',
])
// 更新仅运行 Git；解析器随插件提供，绝不在机器人目录调用包管理器。
const updateError = (code, message) => Object.assign(new Error(message), { updateCode: code })
const errorText = error => String(error.stderr || error.message || error).replace(/https?:\/\/[^\s@]+:[^\s@]+@/g, '[REDACTED]')

export function canonicalOrigin(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return ''
    const pathname = url.pathname.replace(/\.git$/i, '').replace(/\/$/, '')
    return `${url.protocol}//${url.host}${pathname}`.toLowerCase()
  } catch { return '' }
}

/** 允许注入执行器做隔离测试，生产只在本插件仓库运行固定命令。 */
export function createPluginUpdater({ cwd = pluginRoot, execFileImpl = execFile, fsImpl = fs, platform = process.platform } = {}) {
  const run = (bin, args, env = {}) => execFileImpl(bin, args, {
    cwd,
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...env },
  })
  const git = args => run('git', args)


  return async function runUpdate() {
    const realRoot = await fsImpl.realpath(cwd)
    const [{ stdout: top }, { stdout: branch }, { stdout: origin }, { stdout: dirty }] = await Promise.all([
      git(['rev-parse', '--show-toplevel']),
      git(['branch', '--show-current']),
      git(['config', '--get', 'remote.origin.url']),
      git(['status', '--porcelain']),
    ])
    const reportedRoot = path.resolve(top.trim())
    const sameRoot = platform === 'win32' ? reportedRoot.toLowerCase() === realRoot.toLowerCase() : reportedRoot === realRoot
    if (!sameRoot) throw updateError('root', '当前目录不是插件仓库根目录')
    if (!allowedOrigins.has(canonicalOrigin(origin.trim()))) throw updateError('origin', 'origin 不属于官方三平台仓库，已拒绝更新')
    if (branch.trim() !== 'main') throw updateError('branch', '当前分支不是 main，已拒绝更新')
    if (dirty.trim()) throw updateError('dirty', '插件有未提交的本地修改，已停止更新')

    const { stdout: before } = await git(['rev-parse', 'HEAD'])
    await git(['pull', '--ff-only', 'origin', 'main'])
    const { stdout: after } = await git(['rev-parse', 'HEAD'])
    const from = before.trim(), to = after.trim()
    const updated = from !== to
    return { updated, from, to }
  }
}

const runPluginUpdate = createPluginUpdater()

export function updateFailureMessage(error) {
  const known = {
    root: '当前目录不是独立的插件仓库，请按安装说明检查安装位置。',
    origin: '更新来源不是支持的官方仓库，请检查本插件的 origin 地址。',
    branch: '当前不在 main 分支，请先确认并切换到 main 后再更新。',
    dirty: '插件有尚未提交的本地修改，已保留这些修改。请处理完修改后再更新。',
  }
  if (known[error?.updateCode]) return known[error.updateCode]
  const detail = errorText(error || '')
  if (/Could not resolve|resolve host|connect|timed? out|timeout|network|ECONN|ENOTFOUND|TLS|SSL/i.test(detail) || error?.killed) return '连接更新源失败或超时，请检查网络后重试。'
  if (/Permission denied|Authentication failed|could not read Username|403|401/i.test(detail)) return '更新源认证失败，请检查仓库访问权限。'
  if (/fast.forward|divergent|would be overwritten|unmerged/i.test(detail)) return '本地与远端存在未处理差异，自动更新已停止，请先处理仓库差异。'
  return '更新未完成，请稍后再试；详细原因已记录到运行日志。'
}

export function createUpdateCoordinator(run = runPluginUpdate) {
  let pending
  return function update() {
    if (pending) return { kind: 'busy', promise: pending }
    pending = Promise.resolve().then(run)
      .then(result => ({ kind: result.updated ? 'updated' : 'current', ...result }))
      .catch(error => {
        globalThis.logger?.error?.(`[指令帮助] 自动更新失败: ${errorText(error)}`)
        return { kind: 'failed', message: updateFailureMessage(error), error }
      })
      .finally(() => { pending = undefined })
    return { kind: 'started', promise: pending }
  }
}

const updateCoordinator = createUpdateCoordinator()
export function updatePlugin() { return updateCoordinator() }
