/** 仅提供名称/展示别名，不改变原插件注册、匹配优先级或业务指令。
 * 已知名称来自插件 README、公开标题与明确的模块品牌前缀。
 */
const names = {
  'xhh-tl': ['小火花', '小火花'],
  'miao-plugin': ['喵喵', '喵喵'],
  'guoba-plugin': ['锅巴', '锅巴'],
  'gloryofkings-plugin': ['王者插件', '王者'],
  'yenai-plugin': ['椰奶', '椰奶'],
  'hs-qiqi-plugin': ['枫叶', '枫叶'],
  'meme-plugin': ['表情包', '表情包'],
  'relay-checkin-plugin': ['中转签到', '中转签到'],
  'xitian-plugin': ['插件管理器', '插件管理器'],
  'command-help-plugin': ['指令帮助', '帮助插件'],
  'atme-plugin': ['艾特记录', '艾特记录'],
  'rconsole-plugin': ['R插件', 'R插件'],
  'atlas': ['Atlas图鉴', 'Atlas图鉴'],
  'gscore-adapter': ['早柚适配器', '早柚'],
  'game-qr-login-plugins': ['游戏扫码登录', '游戏扫码'],
  'xiaoyao-cvs-plugin': ['米游社扫码', '米游社扫码'],
  'xiaofei-plugin': ['小飞', '小飞'],
  'xianxin-plugin': ['闲心', '闲心'],
  'suiyue': ['碎月', '碎月'],
  'quote-plugin': ['群聊语录', '语录'],
  'douyin-sticker-plugin': ['抖音表情包', '抖音表情包'],
  'genshin': ['原神基础', '原神'],
  'hl-ai-plugin': ['AI对话', 'AI对话'],
  'ffmpeg-plugin': ['FFmpeg多媒体', 'FFmpeg'],
  'trss-plugin': ['TRSS插件', 'TRSS'],
  'wiki': ['Wiki扩展', 'Wiki扩展'],
  'system': ['系统功能', '系统功能'],
}

export function normalizeName(value) {
  return String(value).toLowerCase().replace(/[\s_\-\[\]【】]/g, '').replace(/插件|plugin/g, '')
}

const reservedNames = new Set(Object.values(names).flat().map(normalizeName))

export function pluginLabel(group) {
  const known = names[String(group.folder).toLowerCase()]
  if (known) return { name: known[0], query: known[1] }
  const chinese = [...(group.aliases || [])].filter(name => name !== group.folder && name.length >= 2 && name.length <= 12 && !reservedNames.has(normalizeName(name)) && /[\u4e00-\u9fff]/.test(name))
  const name = chinese.length === 1 ? chinese[0] : group.folder
  return { name, query: name }
}

/** 仅隐藏目录里的演示项，不卸载、不禁止直接查看或关键词检索。 */
export function directoryGroups(catalog) {
  return catalog.groups.filter(group => !['example', 'demo'].includes(String(group.folder).toLowerCase()))
}
