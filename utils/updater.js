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
// 命令行只接收固定参数。Windows 用 cmd 启动 pnpm.cmd；实装在 Linux/JiuLi 验证。
const installArgs = ['install', '--ignore-workspace', '--ignore-scripts', '--no-lockfile']
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
  const installDependencies = () => platform === 'win32'
    ? run('cmd.exe', ['/d', '/c', 'pnpm', ...installArgs], { CI: 'true' })
    : run('pnpm', installArgs, { CI: 'true' })

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
    if (!sameRoot) throw new Error('当前目录不是插件仓库根目录')
    if (!allowedOrigins.has(canonicalOrigin(origin.trim()))) throw new Error('origin 不属于官方三平台仓库，已拒绝更新')
    if (branch.trim() !== 'main') throw new Error('当前分支不是 main，已拒绝更新')
    if (dirty.trim()) throw new Error('插件有未提交的本地修改，已停止更新')

    const { stdout: gitPath } = await git(['rev-parse', '--git-path', 'command-help-dependencies-pending'])
    const marker = path.resolve(cwd, gitPath.trim())
    const { stdout: before } = await git(['rev-parse', 'HEAD'])
    await git(['pull', '--ff-only', 'origin', 'main'])
    const { stdout: after } = await git(['rev-parse', 'HEAD'])
    const from = before.trim(), to = after.trim()
    const updated = from !== to
    const result = { updated, from, to }
    if (updated) {
      const { stdout: packageDiff } = await git(['diff', '--name-only', from, to, '--', 'package.json', 'package-lock.json', 'pnpm-lock.yaml'])
      if (packageDiff.trim()) await fsImpl.writeFile(marker, to)
    }
    // 代码已快进但依赖失败时保留标记，重发指令即使没有新提交也会再装。
    try { await fsImpl.access(marker) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      return result
    }
    try {
      await installDependencies()
      await fsImpl.rm(marker, { force: true })
      return { ...result, dependenciesInstalled: true }
    } catch (error) {
      globalThis.logger?.error?.(`[指令帮助] pnpm 安装依赖失败: ${errorText(error)}`)
      return { ...result, dependenciesFailed: true }
    }
  }
}

const runPluginUpdate = createPluginUpdater()

export function createUpdateCoordinator(run = runPluginUpdate) {
  let pending
  return function update() {
    if (pending) return { kind: 'busy', promise: pending }
    pending = Promise.resolve().then(run)
      .then(result => ({ kind: result.dependenciesFailed ? 'dependencies-failed' : result.updated || result.dependenciesInstalled ? 'updated' : 'current', ...result }))
      .catch(error => {
        globalThis.logger?.error?.(`[指令帮助] 自动更新失败: ${errorText(error)}`)
        return { kind: 'failed', error }
      })
      .finally(() => { pending = undefined })
    return { kind: 'started', promise: pending }
  }
}

const updateCoordinator = createUpdateCoordinator()
export function updatePlugin() { return updateCoordinator() }
