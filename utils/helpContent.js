/** 图片帮助和文字兜底共用一份指令表，别名不能只更新一侧。 */
export const helpSections = [
  { id: 'directory', group: 'entry', title: '查看插件目录', command: '#指令', description: '选一个插件，浏览它的功能卡片。', aliases: '#指令列表 / #指令总览 / #指令 插件' },
  { id: 'help', group: 'entry', title: '查看使用帮助', command: '#指令帮助', description: '查找方式、常用示例都在这里。', aliases: '#指令help' },
  { id: 'plugin', group: 'search', title: '按插件查看', command: '#指令小火花', description: '中文名或目录名都能查；有帮助资料时展示用法和示例。', aliases: '#指令<插件名> / #指令 <插件名> / #指令+<插件名>', extra: '只查插件：#指令 插件 <插件名>' },
  { id: 'keyword', group: 'search', title: '多个词一起搜', command: '#指令 搜索 签到 自动', description: '空格分词、同义词检索，相关结果优先。', aliases: '#指令<关键词> / #指令 <关键词> / #指令+<关键词>', extra: '只搜关键词：#指令 搜索 <关键词>' },
  { id: 'scoped', group: 'search', title: '插件内搜索', command: '#指令 小火花 体力', description: '只在指定插件中查名称和说明。', aliases: '#指令 <插件名> <关键词>', extra: '明确指定：#指令 插件 <插件名> <关键词>' },
  { id: 'text', group: 'search', title: '复制完整文字', command: '#指令文字 小火花', description: '查看名称、别名、说明和适用限制。', aliases: '#指令文字<插件名> / #指令文字 <插件名> / #指令文字+<插件名>', extra: '也支持搜索、插件内查询和翻页' },
  { id: 'page', group: 'search', title: '查看下一页', command: '#指令小火花 第2页', description: '目录、搜索、收藏在原查询后加「第N页」。', aliases: '<原查询> 第N页', extra: '测试与冲突的翻页写法见下方' },
  { id: 'test', group: 'match', title: '测试完整消息', command: '#测试命令#绑定', description: '查看匹配候选，保留被测消息里的页码。', aliases: '#测试命令<完整消息> / #测试命令 <完整消息>', extra: '翻页：#测试命令 --页=2 -- <完整消息>' },
  { id: 'conflict', group: 'match', title: '指令冲突诊断', command: '#指令冲突 #绑定', description: '按加载顺序列出候选、优先级和限制。', aliases: '#指令冲突<完整消息> / #指令冲突 <完整消息>', extra: '翻页：#指令冲突 --页=2 -- <完整消息>' },
  { id: 'favorite', group: 'favorites', title: '收藏与查看', command: '#指令收藏 #指令帮助', description: '收藏目录中的指令名称，不带账号等参数。', aliases: '#指令收藏 / #常用指令', extra: '两个入口都可加 <指令名称> 收藏' },
  { id: 'remove', group: 'favorites', title: '取消一条收藏', command: '#取消收藏 1', description: '先查看收藏序号，再取消不常用的条目。', aliases: '#取消收藏 <序号>', extra: '收藏按机器人和用户分别保存' },
  { id: 'status', group: 'maintain', title: '查看运行状态', command: '#指令状态', description: '查看目录覆盖、缓存与出图情况。', aliases: '仅主人可用' },
  { id: 'refresh', group: 'maintain', title: '手动刷新目录', command: '#指令刷新', description: '重查注册规则、源码说明和帮助资料。', aliases: '仅主人可用' },
  { id: 'update', group: 'maintain', title: '更新插件', command: '#指令更新', description: '仅拉取插件代码，无需安装依赖。', aliases: '仅主人可用' },
]

export const helpNotes = [
  '精确测试与冲突诊断只匹配，不执行被测指令。',
  '被测消息本身以 -- 开头时，用「#测试命令 -- <完整消息>」保留原文。',
  '图片或合并转发不可用时，回退当前页文字；内容较长会分段发送。',
  '参数示例来自插件帮助资料；未提供时请查看原插件帮助。',
]
export const helpText = ['指令帮助', ...helpSections.map(row => `${row.title}：${row.command}\n${row.description}\n${row.aliases}${row.extra ? '\n' + row.extra : ''}`), ...helpNotes].join('\n\n')
