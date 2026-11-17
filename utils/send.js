/** 汇总云崽/JiuLi/OneBot 常见的显式失败形态；不把 {error: []} 当失败。 */
export function sendSucceeded(result) {
  if (result === false) return false
  if (!result || typeof result !== 'object') return true
  for (const key of ['error', 'err']) {
    const error = result[key]
    if (Array.isArray(error) ? error.length > 0 : Boolean(error)) return false
  }
  if (result.success === false || result.status === 'failed' || result.status === 'error') return false
  if (result.retcode !== undefined && Number(result.retcode) !== 0 && Number(result.retcode) !== 1) return false
  return true
}
