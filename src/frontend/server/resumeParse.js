// 简历结构解析：文本型 PDF 用坐标+字号分析、DOCX 用 mammoth HTML 结构，统一产出结构化 JSON
// 不修改简历原文，只做版式结构识别与归位，供 A4 HTML 美化渲染
import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { detectOccupation } from './resumeOccupation.js';

// ---------- 章节标题关键词 ----------
const SECTION_RULES = [
  { id: 'self_evaluation', re: /^(个人优势|自我评价|个人评价|自我评估|自我总结|核心优势|个人亮点|个人特长|职业优势|能力优势|竞争优势|个人概述)$/ },
  { id: 'summary', re: /^(个人摘要|个人简介|职业概述|职业概要|个人概况|个人综述|个人总结|简介|概述|summary|profile)$/i },
  { id: 'work_experience', re: /^(工作经历|工作经验|职业经历|工作履历|从业经历|实习经历|实习经验|工作背景|任职经历)$/ },
  { id: 'project_experience', re: /^(项目经历|项目经验|项目案例|参与项目|主导项目|项目实践|项目工作)$/ },
  { id: 'education', re: /^(教育经历|教育背景|学习经历|教育情况|教育|学历)$/ },
  { id: 'skills', re: /^(技能特长|专业技能|技能|技术栈|核心技能|专业能力|职业技能|技能证书|技术能力)$/ },
  { id: 'certificates', re: /^(证书|资格证书|证书资质|资质证书|职称|职业资格|专业证书)$/ },
  { id: 'awards', re: /^(获奖|荣誉|获奖荣誉|奖项|所获荣誉|荣誉证书|获奖情况)$/ },
  { id: 'basic', re: /^(基本信息|个人信息|个人资料|联系方式|基本资料|个人情况)$/ },
  { id: 'job_intention', re: /^(求职意向|期望职位|意向岗位|目标岗位|职业意向)$/ },
  { id: 'training', re: /^(培训经历|培训|进修)$/ },
  { id: 'languages', re: /^(语言能力|语言|外语能力)$/ },
  { id: 'volunteer', re: /^(志愿者经历|志愿者服务|公益活动|社会活动)$/ },
  { id: 'social', re: /^(社团活动|学生工作|校园经历)$/ },
  { id: 'publications', re: /^(发表论文|论文|著作|学术成果|出版著作)$/ },
  { id: 'patents', re: /^(专利|专利成果)$/ },
  { id: 'portfolio', re: /^(个人作品|作品集|代表作品)$/ },
  { id: 'open_source', re: /^(开源项目|开源贡献)$/ },
  { id: 'interests', re: /^(兴趣爱好|兴趣|爱好)$/ },
  { id: 'references', re: /^(推荐人|证明人)$/ },
];
function matchSection(text) {
  const t = String(text || '').replace(/[：:\s]/g, '').trim();
  if (!t || t.length > 12) return null;
  for (const rule of SECTION_RULES) if (rule.re.test(t)) return rule.id;
  return null;
}

// 职位关键词（从右往左切分「公司+职位」用，长词在前）
const JOB_TITLE_WORDS = ['产品经理', '项目经理', '技术负责人', '项目负责人', '研发负责人', '部门主管', '高级工程师', '测试工程师', '前端工程师', '后端工程师', '架构师', '负责人', '工程师', '经理', '总监', '主管', '专员', '顾问', '专家', '助理', '设计师', '开发', '测试', '运维', '.NET', 'Java', '前端', '后端', '算法', '产品', '运营', '市场', '销售', 'CTO', 'CEO', 'COO', 'CFO'];
// 强公司后缀（中文公司名通常以此结尾）
const COMPANY_SUFFIXES = ['股份有限公司', '有限责任公司', '有限公司', '集团公司', '公司', '集团', '工作室', '事务所', '研究院', '实验室', '诊所', '医院'];

// ---------- 通用工具 ----------
function cleanNoise(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^(无|暂无|未知|无记录|-|—|n\/a|N\/A|null|undefined)$/.test(s)) return '';
  return s;
}
function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '');
}
function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
function cleanListItem(text) {
  return String(text || '').replace(/^\s*(?:[\d一二三四五六七八九十百]+\s*[、.．)）]|[-*•·▪]\s*)\s*/, '').trim();
}
function normDate(y, m) {
  if (!y) return '';
  const mm = m ? String(m).padStart(2, '0') : '';
  return mm ? `${y}-${mm}` : String(y);
}

// ---------- PDF：坐标 + 字号 → 行 ----------
export async function extractPdfLines(filePath, maxPages = 12) {
  const buf = await fs.readFile(filePath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  try {
    const rows = [];
    const pages = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = (tc.items || [])
        .filter(it => it.str && String(it.str).trim())
        .map(it => ({
          s: String(it.str), x: it.transform[4], y: it.transform[5],
          h: it.height || 0, w: it.width || 0, font: it.fontName || '',
        }));
      const groups = groupByY(items);
      for (const g of groups) {
        for (const seg of splitByX(g)) {
          rows.push({ ...seg, page: p });
        }
      }
      page.cleanup();
    }
    rows.sort((a, b) => a.page - b.page || b.y - a.y);
    const bodyFont = modeFontSize(rows);
    return rows.map(r => ({ text: r.text, x: r.x, y: r.y, page: r.page, fontSize: r.fontSize, bold: r.bold, bodyFont }));
  } finally {
    await doc.destroy();
  }
}
function groupByY(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const groups = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(last.maxH, it.h) * 0.6) {
      last.items.push(it);
      last.y = (last.y + it.y) / 2;
      last.maxH = Math.max(last.maxH, it.h);
    } else {
      groups.push({ y: it.y, maxH: it.h, items: [it] });
    }
  }
  return groups;
}
function splitByX(group) {
  const items = [...group.items].sort((a, b) => a.x - b.x);
  const segs = [];
  let cur = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].x - items[i - 1].x - items[i - 1].w;
    if (gap > 20) { segs.push(cur); cur = []; }
    cur.push(items[i]);
  }
  segs.push(cur);
  return segs.map(seg => {
    const x = Math.min(...seg.map(s => s.x));
    const h = Math.max(...seg.map(s => s.h));
    const text = seg.map(s => s.s).join('').replace(/\s+/g, ' ').trim();
    const bold = seg.some(s => /Bold|bold|Hei|BD|Black/i.test(s.font));
    return { text, x, y: Math.round(group.y), fontSize: Math.round(h * 10) / 10, bold };
  }).filter(r => r.text);
}
function modeFontSize(rows) {
  const freq = {};
  for (const r of rows) {
    const k = Math.round(r.fontSize * 2) / 2;
    freq[k] = (freq[k] || 0) + 1;
  }
  let best = null, bestCount = -1;
  for (const k of Object.keys(freq)) {
    if (freq[k] > bestCount) { bestCount = freq[k]; best = Number(k); }
  }
  return best || 10;
}

// ---------- DOCX：mammoth HTML → 行 ----------
export async function extractDocxLines(filePath) {
  const htmlResult = await mammoth.convertToHtml({ path: filePath });
  const rawResult = await mammoth.extractRawText({ path: filePath });
  const lines = htmlToLines(htmlResult.value);
  return {
    lines: lines.map(l => ({ ...l, bodyFont: 10 })),
    rawText: rawResult.value || '',
    html: htmlResult.value || '',
  };
}
function htmlToLines(html) {
  const lines = [];
  const re = /<(h[1-6]|p|li|tr)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = String(m[1]).toLowerCase();
    const raw = m[2];
    // mammoth 将 Word 加粗字符样式输出为 <strong>，作为章节标题/条目头的字号信号
    const hasStrong = /<strong\b|<b\b/i.test(raw);
    let inner = decodeHtmlEntities(stripTags(raw));
    if (tag === 'tr') {
      const cells = [...raw.matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/gi)].map(x => decodeHtmlEntities(stripTags(x[1])).trim()).filter(Boolean);
      inner = cells.join(' | ');
    }
    inner = inner.replace(/\s+/g, ' ').trim();
    if (!inner) continue;
    if (/^h[1-6]$/.test(tag)) {
      lines.push({ text: inner, kind: 'title', level: Number(tag[1]), bold: true, x: 0, y: 0, fontSize: 16 - Number(tag[1]) });
    } else if (tag === 'li') {
      lines.push({ text: inner, kind: 'list', level: 0, bold: false, x: 0, y: 0, fontSize: 10 });
    } else {
      const bold = hasStrong && inner.length <= 30;
      lines.push({ text: inner, kind: 'para', level: 0, bold, x: 0, y: 0, fontSize: bold ? 12 : 10 });
    }
  }
  return lines;
}

// ---------- 自由区块 → 结构化字段映射（本地解析无字段级抽取，按行原样存储） ----------
const FREE_SECTION_KEY = {
  '培训经历': 'training', '培训': 'training', '进修': 'training',
  '语言能力': 'languages', '语言': 'languages', '外语能力': 'languages',
  '志愿者经历': 'volunteer', '志愿者服务': 'volunteer', '公益活动': 'volunteer', '社会活动': 'volunteer',
  '社团活动': 'social', '学生工作': 'social', '校园经历': 'social',
  '发表论文': 'publications', '论文': 'publications', '著作': 'publications', '学术成果': 'publications',
  '专利': 'patents', '专利成果': 'patents',
  '个人作品': 'portfolio', '作品集': 'portfolio', '代表作品': 'portfolio',
  '开源项目': 'open_source', '开源贡献': 'open_source',
  '兴趣爱好': 'interests', '兴趣': 'interests', '爱好': 'interests',
  '推荐人': 'references', '证明人': 'references',
};
function pushFreeSection(structured, target, title, content) {
  const lines = content.split('\n').map(x => x.trim()).filter(Boolean);
  if (!lines.length) return;
  if (target === 'languages' || target === 'interests') {
    structured[target] = [...(structured[target] || []), ...lines];
    return;
  }
  if (target === 'training' || target === 'volunteer' || target === 'social' || target === 'publications' || target === 'patents' || target === 'portfolio' || target === 'open_source' || target === 'references') {
    // 本地解析无字段级抽取：每条按 { name: 首行, description: 其余行 } 存，AI 路径会输出完整字段
    const items = [];
    let head = '';
    let rest = [];
    for (const ln of lines) {
      const isNewHead = head && (ln.length <= 40) && !/[，。；：:]$/.test(ln) && rest.length >= 2;
      if (!head) { head = ln; continue; }
      if (isNewHead) { items.push({ name: head, description: rest.join('\n') }); head = ln; rest = []; continue; }
      rest.push(ln);
    }
    if (head) items.push({ name: head, description: rest.join('\n') });
    structured[target] = [...(structured[target] || []), ...items.filter(x => x.name)];
  }
}

// ---------- 统一：lines → structured ----------
const TECH_WORDS = ['.NET', 'C#', 'Java', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Objective-C', 'C++', 'Vue', 'React', 'Angular', 'Node.js', 'Express', 'Django', 'Flask', 'Spring Boot', 'Spring', 'MyBatis', 'Hibernate', 'Redis', 'Memcached', 'MySQL', 'PostgreSQL', 'Oracle', 'SQL Server', 'SqlServer', 'MongoDB', 'Elasticsearch', 'Kafka', 'RabbitMQ', 'RocketMQ', 'ActiveMQ', 'Docker', 'Kubernetes', 'K8s', 'Nginx', 'Linux', 'Hadoop', 'Spark', 'Flink', 'Hive', 'ZooKeeper', 'Dubbo', 'gRPC', 'WebSocket', 'Layui', 'Jquery', 'jQuery', 'axios', 'HTML5', 'HTML', 'CSS3', 'CSS', 'Sass', 'Less', 'Webpack', 'Vite', 'Git', 'SVN', 'Maven', 'Gradle', 'Jenkins', '微服务', '分布式', '高并发', '缓存', '消息队列', '大数据', '云计算', '人工智能', '机器学习', '深度学习', '物联网', '区块链', 'WCF', 'ORM', 'MVC', 'API', 'RESTful', 'GraphQL', '微信小程序', 'Flutter', 'React Native', 'Element UI', 'Ant Design', 'Bootstrap', 'uniapp'];

export function structureFromLines(lines) {
  const bodyFont = lines[0]?.bodyFont || 10;
  // 1. 分类：章节标题 / 条目头 / 正文
  const sections = []; // { id, title, entries: [line], body: [] }
  let current = null;
  const headLines = [];
  for (const line of lines) {
    const sec = isSectionLine(line, bodyFont);
    if (sec) {
      current = { id: sec, title: line.text.trim(), entries: [], body: [] };
      sections.push(current);
    } else if (!current) {
      headLines.push(line);
    } else if (current.id === 'work_experience' || current.id === 'project_experience' || current.id === 'education') {
      // PDF 同行归位：公司名/职位/日期常在同一视觉行被坐标拆分，日期行不得新建条目
      const sameLineAsLastHead = line.x > 0 && line.y > 0 && current.entries.length > 0 && line.y === current.entries[current.entries.length - 1].head.y;
      if (isEntryHead(line, bodyFont, current.id) && !sameLineAsLastHead) current.entries.push({ head: line, lines: [] });
      else if (current.entries.length) current.entries[current.entries.length - 1].lines.push(line);
      else current.body.push(line);
    } else {
      current.body.push(line);
    }
  }
  // 2. 组装 structured
  const basic = parseBasic(headLines);
  const structured = {
    schema_version: 2,
    basic,
    job_intention: {},
    education: [],
    work_experience: [],
    project_experience: [],
    skills: { technical: [], tools: [], soft: [], languages: [] },
    certificates: [],
    awards: [],
    training: [],
    languages: [],
    volunteer: [],
    social: [],
    publications: [],
    patents: [],
    portfolio: [],
    open_source: [],
    interests: [],
    references: [],
    self_evaluation: '',
    summary: '',
    extra_sections: [],
    warnings: [],
  };
  const fullText = lines.map(l => l.text).join('\n');
  structured.skills.technical = extractTechSkills(fullText);
  for (const sec of sections) {
    switch (sec.id) {
      case 'self_evaluation': structured.self_evaluation = joinBody(sec.body); break;
      case 'summary': structured.summary = joinBody(sec.body); break;
      case 'work_experience': structured.work_experience = parseWorkEntries(sec.entries, fullText); break;
      case 'project_experience': structured.project_experience = parseProjectEntries(sec.entries, fullText); break;
      case 'education': structured.education = parseEducationEntries(sec.entries); break;
      case 'skills': structured.skills = mergeSkills(structured.skills, sec.body); break;
      case 'certificates': structured.certificates = sec.body.map(l => l.text).filter(cleanNoise); break;
      case 'awards': structured.awards = sec.body.map(l => l.text).filter(cleanNoise); break;
      case 'basic': {
        const b = parseBasic(sec.body);
        for (const k of Object.keys(b)) if (!structured.basic[k]) structured.basic[k] = b[k];
        break;
      }
      case 'job_intention': {
        const text = joinBody(sec.body);
        if (text) {
          const linesArr = text.split('\n').map(x => x.trim()).filter(Boolean);
          const ji = {};
          const first = linesArr[0] || '';
          if (first) ji.target_position = first.replace(/^目标岗位|^期望职位|^意向岗位|^求职意向|^[：:]\s*/, '').trim();
          const city = text.match(/期望城市[：:]?\s*([\u4e00-\u9fa5]{2,8}?(?:市|省|区|县))/);
          if (city) ji.expected_city = city[1];
          const salary = text.match(/期望薪资[：:]?\s*([^\n]{2,20})/);
          if (salary) ji.expected_salary = salary[1].trim();
          const jobType = text.match(/(全职|兼职|实习|校园招聘|校招)/);
          if (jobType) ji.job_type = jobType[1];
          structured.job_intention = ji;
        }
        break;
      }
      default: {
        const content = joinBody(sec.body);
        if (content) {
          const target = FREE_SECTION_KEY[sec.title];
          if (target) pushFreeSection(structured, target, sec.title, content);
          else structured.extra_sections.push({ title: sec.title, content });
        }
      }
    }
  }
  // 3. 条目内容清洗（去除空条目）
  structured.work_experience = structured.work_experience.filter(x => x.company || x.title);
  structured.project_experience = structured.project_experience.filter(x => x.name || x.role);
  structured.education = structured.education.filter(x => x.school || x.degree || x.major);
  // 4. 职业识别：写入 structured.occupation 元数据（供渲染强调与后台对号入座）
  structured.occupation = detectOccupation(fullText, structured);
  return { structured, fullText };
}

function isSectionLine(line, bodyFont) {
  if (line.kind === 'title') return matchSection(line.text);
  if (line.kind === 'list') return null;
  const t = line.text.trim();
  if (!t || t.length > 12) return null;
  const sizeOk = line.fontSize >= Math.max(bodyFont * 1.18, bodyFont + 2);
  const leftPos = line.x < 150;
  if (sizeOk && leftPos) return matchSection(t);
  if (sizeOk) return matchSection(t);
  return null;
}
function isEntryHead(line, bodyFont, sectionId) {
  if (line.kind === 'title' && !matchSection(line.text)) return true;
  if (line.kind === 'list') return false;
  const t = line.text.trim();
  if (!t || t.length > 60) return false;
  const sizeOk = line.fontSize >= Math.max(bodyFont * 1.12, bodyFont + 1.5);
  const hasTime = /\d{4}[./年]\s*\d{0,2}\s*[-~至到]\s*\d{4}/.test(t) || /至今|现在|今|当前/.test(t);
  // 教育条目：学校 + 学历 + 年份
  if (sectionId === 'education') {
    return /(大学|学院|学校|中学)/.test(t) || /^(本科|硕士|博士|大专|专科|学士|高中|中专|初中)/.test(t);
  }
  if (hasTime) return true;
  return sizeOk && !isSectionLine(line, bodyFont);
}
function joinBody(body) {
  return body.map(l => l.text.trim()).filter(Boolean).join('\n');
}

// ---------- 头部基本信息 ----------
function parseBasic(headLines) {
  const basic = {};
  const text = headLines.map(l => l.text).join('\n');
  const nameLine = [...headLines].sort((a, b) => b.fontSize - a.fontSize)[0];
  if (nameLine && nameLine.fontSize >= 14) basic.name = nameLine.text.trim();
  const phone = text.match(/(?<!\d)(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})(?!\d)/);
  if (phone) basic.phone = phone[1];
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) basic.email = email[0];
  const birth = text.match(/生\s*日\s*[：:]?\s*(\d{4})[./年]?\s*(\d{1,2})?/);
  if (birth) basic.birth_year = Number(birth[1]);
  const gender = text.match(/[性别]?\s*[：:]?\s*(男|女)/);
  if (gender) basic.gender = gender[1];
  const loc = text.match(/[地所在]?\s*[：:]?\s*([\u4e00-\u9fa5]{2,8}?(?:省|市|自治区|特别行政区|区|县))/);
  if (!loc) {
    const cityMatch = text.match(/(北京|上海|广州|深圳|杭州|成都|南京|武汉|西安|苏州|重庆|天津|长沙|青岛|大连|厦门|福州|济南|郑州|合肥|昆明|宁波|无锡|东莞|佛山|珠海|常州|南通|徐州|温州|嘉兴|绍兴|石家庄|太原|沈阳|长春|哈尔滨|呼和浩特|兰州|西宁|银川|乌鲁木齐|拉萨|南宁|海口|贵阳|昆明)/);
    if (cityMatch) basic.location = cityMatch[1];
  } else basic.location = loc[1];
  const exp = text.match(/(\d{1,2})\s*年\s*(?:工作|从业|经验|以上)/);
  if (exp) basic.years_of_experience = Number(exp[1]);
  return basic;
}

// ---------- 工作/项目条目 ----------
const DATE_LINE_RE = /(\d{4}[./年]?\s*\d{0,2}\s*[-~至到]\s*(\d{4}[./年]?\s*\d{0,2}|至今))/;
function findDateLine(lines) {
  const di = lines.findIndex(l => DATE_LINE_RE.test(String(l.text || '')));
  if (di < 0) return null;
  const found = splitTime(lines[di].text);
  if (!found.time.start) return null;
  return { idx: di, time: found.time };
}
function isTitleLine(l) {
  const t = String(l.text || '').trim();
  if (!t || t.length > 24) return false;
  if (/\d{4}/.test(t)) return false;
  if (/^[-•·*●]/.test(t) || /^[（(]?\d{1,2}[)）]?[、.．]/.test(t)) return false;
  if (/^(内容|职责|工作内容|岗位职责|主要职责|工作职责|业绩|主要业绩|成就|成果|项目描述|项目介绍|描述)[：:：]?$/.test(t)) return false;
  return /(经理|主管|总监|工程师|专员|负责人|架构师|顾问|专家|助理|设计师|技术|开发|测试|运维|产品|运营|市场|销售|主任|组长|班长|\.NET|Java|前端|后端|算法|CTO|CEO|COO|CFO)/.test(t);
}
function parseWorkEntries(entries, fullText) {
  return entries.map(e => {
    const lines = [...e.lines];
    let { time, rest } = splitTime(e.head.text);
    if (!time.start) {
      const dl = findDateLine(lines);
      if (dl) { time = dl.time; lines.splice(dl.idx, 1); }
    }
    let { company, title } = splitCompanyTitle(rest);
    if (!title) {
      const ti = lines.findIndex(isTitleLine);
      if (ti > -1) { title = lines[ti].text.trim(); lines.splice(ti, 1); }
    }
    const parsed = { company: cleanNoise(company), title: cleanNoise(title), start_date: time.start, end_date: time.end, industry: '', responsibilities: [], achievements: [], skills_used: extractTechSkills(lines.map(l => l.text).join('\n') + ' ' + fullText) };
    let mode = 'resp';
    for (const l of lines) {
      const t = l.text.trim();
      if (!t) continue;
      if (/^(内容|工作内容|岗位职责|职责|主要职责|工作职责|负责)[：:：]?$/.test(t)) { mode = 'resp'; continue; }
      if (/^(业绩|主要业绩|成就|成果|工作业绩|业绩成就|项目业绩)[：:：]?$/.test(t)) { mode = 'achie'; continue; }
      if (/^(项目描述|项目介绍|项目内容|描述)[：:：]?$/.test(t)) { mode = 'desc'; continue; }
      const item = cleanListItem(t);
      if (!item) continue;
      if (mode === 'achie') parsed.achievements.push(item);
      else parsed.responsibilities.push(item);
    }
    return parsed;
  });
}
function parseProjectEntries(entries, fullText) {
  return entries.map(e => {
    const lines = [...e.lines];
    let { time, rest } = splitTime(e.head.text);
    if (!time.start) {
      const dl = findDateLine(lines);
      if (dl) { time = dl.time; lines.splice(dl.idx, 1); }
    }
    let { company, title } = splitCompanyTitle(rest);
    if (!title) {
      const ti = lines.findIndex(isTitleLine);
      if (ti > -1) { title = lines[ti].text.trim(); lines.splice(ti, 1); }
    }
    const parsed = { name: cleanNoise(company), role: cleanNoise(title), start_date: time.start, end_date: time.end, description: '', achievements: [], tech_stack: extractTechSkills(lines.map(l => l.text).join('\n') + ' ' + fullText) };
    let mode = 'desc';
    for (const l of lines) {
      const t = l.text.trim();
      if (!t) continue;
      if (/^(内容|项目描述|项目介绍|项目内容|描述|职责|主要职责)[：:：]?$/.test(t)) { mode = 'desc'; continue; }
      if (/^(业绩|主要业绩|成就|成果|项目业绩)[：:：]?$/.test(t)) { mode = 'achie'; continue; }
      const item = cleanListItem(t);
      if (!item) continue;
      if (mode === 'achie') parsed.achievements.push(item);
      else parsed.description += (parsed.description ? '\n' : '') + item;
    }
    return parsed;
  });
}
function splitTime(text) {
  const re = /(\d{4})[./年]?\s*(\d{1,2})?\s*[-~至到]\s*(\d{4})[./年]?\s*(\d{1,2})?|(\d{4})[./年]?\s*(\d{1,2})?\s*[-~至到]\s*(至今|现在|今|当前)/;
  const m = String(text).match(re);
  if (!m) return { time: { start: '', end: '' }, rest: String(text).trim() };
  let start = '', end = '';
  if (m[1]) { start = normDate(m[1], m[2]); end = normDate(m[3], m[4]); }
  else if (m[5]) { start = normDate(m[5], m[6]); end = /至今|现在|今|当前/.test(m[7] || '') ? '至今' : ''; }
  const rest = String(text).replace(re, ' ').replace(/\s+/g, ' ').trim();
  return { time: { start, end }, rest };
}
function splitCompanyTitle(rest) {
  let text = String(rest || '').trim();
  if (!text) return { company: '', title: '' };
  // 0) 显式分隔符（DOCX/文本常见：「公司 | 职位」或「公司，职位」）
  const segs = text.split(/[|｜,，、]/).map(s => s.trim()).filter(Boolean);
  if (segs.length >= 2) {
    let company = '', title = '';
    for (const s of segs) {
      const hasSuffix = COMPANY_SUFFIXES.some(suf => s.endsWith(suf));
      const hasJob = JOB_TITLE_WORDS.some(w => s.includes(w));
      if (!company && hasSuffix) company = s;
      else if (!title && hasJob && s !== company) title = s;
    }
    if (company && title) return { company, title };
    if (company && !title) return { company, title: segs[segs.length - 1] === company ? '' : segs[segs.length - 1] };
    if (!company && title) return { company: segs[0] === title ? '' : segs[0], title };
    // 分隔符场景但信号不足：首段公司、末段职位
    return { company: segs[0], title: segs[segs.length - 1] };
  }
  // 1) 强公司后缀（从右往左第一个）
  let idx = -1, matchLen = 0;
  for (const suf of COMPANY_SUFFIXES) {
    const i = text.lastIndexOf(suf);
    if (i > -1 && (idx === -1 || i > idx)) { idx = i; matchLen = suf.length; }
  }
  if (idx > 0 && idx + matchLen < text.length) {
    return { company: text.slice(0, idx + matchLen).trim(), title: text.slice(idx + matchLen).trim() };
  }
  if (idx > -1) {
    return { company: text.trim(), title: '' };
  }
  // 2) 职位关键词（长词优先，避免「工程师」吃掉「高级工程师」）
  const sortedWords = [...JOB_TITLE_WORDS].sort((a, b) => b.length - a.length);
  for (const w of sortedWords) {
    const i = text.lastIndexOf(w);
    if (i > 0) return { company: text.slice(0, i).trim(), title: text.slice(i).trim() };
  }
  return { company: text.trim(), title: '' };
}
function parseEducationEntries(entries) {
  return entries.map(e => {
    // head 为学校行；学历/日期/专业可能同行或在后续行（PDF 常按列拆分）
    const edu = { school: '', degree: '', major: '', start_date: '', end_date: '', gpa: '', honors: [] };
    const degreeRe = /(博士|硕士|本科|大专|专科|学士|MBA|EMBA|高中|中专|初中)/;
    const headLines = [e.head, ...e.lines];
    for (const l of headLines) {
      const t = String(l.text || '').trim();
      if (!t) continue;
      // 显式分段（DOCX/文本常见：「时间 | 学校 | 学历 | 专业」）
      const segs = t.split(/[|｜]/).map(s => s.trim()).filter(Boolean);
      if (segs.length >= 2) {
        for (const seg of segs) {
          const { time } = splitTime(seg);
          if (time.start && !edu.start_date) { edu.start_date = time.start; edu.end_date = time.end; continue; }
          if (!edu.school && /(大学|学院|学校|中学)/.test(seg)) { edu.school = seg; continue; }
          if (!edu.degree) {
            const d = seg.match(degreeRe);
            if (d) { edu.degree = d[1]; continue; }
          }
          if (!edu.major && !/(大学|学院|学校|中学)/.test(seg) && seg.length >= 2 && seg.length <= 40) edu.major = seg;
        }
        continue;
      }
      const { time, rest } = splitTime(t);
      if (time.start && !edu.start_date) { edu.start_date = time.start; edu.end_date = time.end; }
      const d = t.match(degreeRe);
      if (!edu.degree && d) {
        const di = t.indexOf(d[1]);
        if (di > 0) {
          if (!edu.school) edu.school = t.slice(0, di).trim();
          edu.degree = d[1];
        } else {
          edu.degree = d[1];
        }
      }
      if (!edu.school && /(大学|学院|学校|中学)/.test(t)) edu.school = t;
      if (!edu.major) {
        const candidate = rest.replace(degreeRe, '').trim();
        if (candidate && candidate.length >= 2 && candidate.length <= 40 && !/(大学|学院|学校|中学)/.test(candidate) && candidate !== edu.school) edu.major = candidate;
      }
    }
    for (const l of e.lines) {
      const t = l.text.trim();
      if (!t) continue;
      const item = cleanListItem(t);
      if (!item) continue;
      if (/^(荣誉|奖项|获奖|在校经历)[：:：]?/.test(item)) continue;
      const bare = item.replace(/\d{4}[./年]?\s*\d{0,2}\s*[-~至到]?\s*\d{0,4}/g, '').replace(/[|｜]/g, '').trim();
      if (item === edu.school || item === edu.degree || item === edu.major || bare === edu.major || /^\d{4}/.test(item)) continue;
      edu.honors.push(item);
    }
    return edu;
  });
}

// ---------- 技能 ----------
function extractTechSkills(text) {
  const all = String(text || '');
  const found = [];
  for (const w of TECH_WORDS) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i');
    if (re.test(all)) found.push(w);
  }
  return found;
}
function mergeSkills(skills, body) {
  const text = body.map(l => l.text).join('\n');
  const tech = extractTechSkills(text);
  const merged = { ...skills, technical: [...new Set([...(skills.technical || []), ...tech])] };
  // 从技能章节文本中粗分类
  return merged;
}

// ---------- PDF 整体入口：能提取到足够文本则返回结构化，否则 null ----------
export async function analyzePdf(filePath) {
  try {
    const lines = await extractPdfLines(filePath);
    const text = lines.map(l => l.text).join('\n');
    if (text.replace(/\s/g, '').length < 80) return null; // 扫描件
    const { structured } = structureFromLines(lines);
    const hasShape = structured.basic && Object.keys(structured.basic).length
      || structured.education.length || structured.work_experience.length
      || structured.project_experience.length || structured.self_evaluation
      || structured.skills.technical.length;
    if (!hasShape) return null;
    return { text, structured, lines };
  } catch {
    return null;
  }
}

// ---------- DOCX 整体入口 ----------
export async function analyzeDocx(filePath) {
  try {
    const { lines, rawText, html } = await extractDocxLines(filePath);
    const text = rawText || lines.map(l => l.text).join('\n');
    if (text.replace(/\s/g, '').length < 30) return null;
    const { structured } = structureFromLines(lines);
    const hasShape = structured.basic && Object.keys(structured.basic).length
      || structured.education.length || structured.work_experience.length
      || structured.project_experience.length || structured.self_evaluation
      || structured.skills.technical.length;
    if (!hasShape) return null;
    return { text, structured, html };
  } catch {
    return null;
  }
}
