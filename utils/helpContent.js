/** 图片帮助和文字兜底共用一份指令表，别名不能只更新一侧。 */
export const helpSections = [
  { title: '查看插件目录', command: '#指令', description: '选择一个插件，查看它有哪些指令。', aliases: '#指令列表 / #指令总览 / #指令 插件' },
  { title: '查看使用帮助', command: '#指令帮助', description: '查看检索方式和常用示例。', aliases: '#指令help' },
  { title: '按插件查看', command: '#指令小火花', description: '中文名或目录名都能查，例如小火花。', aliases: '#指令<插件名> / #指令 <插件名> / #指令+<插件名>', extra: '只查插件：#指令 插件 <插件名>' },
  { title: '按关键词搜索', command: '#指令绑定', description: '搜索这个词对应的指令。', aliases: '#指令<关键词> / #指令 <关键词> / #指令+<关键词>', extra: '只搜关键词：#指令 搜索 <关键词>' },
  { title: '测试完整消息', command: '#测试命令#绑定', description: '查看匹配的插件，不执行被测指令。', aliases: '#测试命令<完整消息> / #测试命令 <完整消息>' },
  { title: '查看下一页', command: '#指令小火花 第2页', description: '在原查询后加「第N页」，查看更多结果。', aliases: '<原查询> 第N页' },
  { title: '插件内搜索', command: '#指令 小火花 体力', description: '只在指定插件里搜索名称和说明。', aliases: '#指令 <插件名> <关键词>', extra: '明确指定：#指令 插件 <插件名> <关键词>' },
  { title: '指令冲突诊断', command: '#指令冲突 #绑定', description: '按匹配顺序查看候选，不执行命令。', aliases: '#指令冲突<完整消息> / #指令冲突 <完整消息>' },
]

export const helpNotes = [
  '每条指令附优先级与简短说明',
  '每个合并转发最多 50 条消息',
  '参数用法可查看对应插件的帮助',
]

export const helpText = ['指令帮助', ...helpSections.map(row => `${row.title}：${row.command}\n${row.description}\n${row.aliases}${row.extra ? '\n' + row.extra : ''}`), ...helpNotes].join('\n\n')
