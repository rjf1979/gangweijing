const $ = selector => document.querySelector(selector);
const steps = ['resume', 'facts', 'job', 'report'];
const routeFor = step => `/${step}`;
let loginMode = true;
let email = '';

function safe(value) {
  const node = document.createElement('span');
  node.textContent = Array.isArray(value) ? value.join('；') : String(value || '');
  return node.innerHTML;
}

function draft() {
  try { return JSON.parse(sessionStorage.getItem('jobMirrorDraft') || '{}'); } catch { return {}; }
}
function saveDraft(patch) { sessionStorage.setItem('jobMirrorDraft', JSON.stringify({ ...draft(), ...patch })); }
async function persistResume(text) { const response = await fetch('/api/resume', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); if (!response.ok) throw new Error((await response.json()).error || '简历保存失败。'); }
function currentStep() {
  const segment = location.pathname.split('/')[1];
  return steps.includes(segment) ? segment : 'resume';
}
function hydrate(step) {
  const d = draft();
  if (step === 'resume') $('#resume-text').value = d.resumeText || '';
  if (step === 'facts') $('#facts-text').value = d.facts || d.resumeText || '';
  if (step === 'job') { $('#job-text').value = d.jobText || ''; $('#company-short-name').value = d.companyShortName || ''; $('#job-title').value = d.jobTitle || ''; }
  if (step === 'report' && d.report) render(d.report, { reportName: d.reportName, reportUrl: d.reportUrl, emailSent: d.emailSent });
}
function show(step, navigate = false) {
  steps.forEach(id => $(`#${id}-step`)?.classList.toggle('hidden', id !== step));
  document.querySelectorAll('[data-step-label]').forEach((el, index) => el.classList.toggle('active', steps[index] === step));
  if (navigate && location.pathname !== routeFor(step)) history.pushState({}, '', routeFor(step));
}
function enter(value, step = currentStep()) {
  email = value;
  const saved = draft();
  if (step === 'resume' && saved.resumeText) step = 'facts';
  if (location.pathname !== routeFor(step)) history.replaceState({}, '', routeFor(step));
  $('#welcome')?.classList.add('hidden');
  $('#email-verification')?.classList.add('hidden');
  $('#flow')?.classList.remove('hidden');
  hydrate(step); show(step);
}
function maskedEmail(value) { const [name, domain = ''] = String(value || '').split('@'); return name ? `${name.slice(0, 2)}***@${domain}` : ''; }
function showVerification(value, sent = null) {
  email = value;
  $('#welcome')?.classList.add('hidden');
  $('#flow')?.classList.add('hidden');
  $('#email-verification')?.classList.remove('hidden');
  $('#verification-copy').textContent = `验证链接已发送至 ${maskedEmail(value)}。完成验证后才能生成和接收分析报告。`;
  $('#verification-status').textContent = sent === true ? '验证邮件已发送，请在 24 小时内完成验证。' : sent === false ? '验证邮件暂未发送成功，请检查邮件配置后重试。' : '如果没有收到邮件，可以重新发送。';
  $('#resend-verification').classList.remove('hidden');
  $('#verification-continue').classList.add('hidden');
}
function mode(login) {
  loginMode = login;
  $('#auth-submit').textContent = login ? '登录并继续' : '创建账号并开始';
  $('#auth-switch').textContent = login ? '没有账号？注册' : '已有账号？登录';
  $('#onboard-error').textContent = '';
}
function go(step) {
  hydrate(step); show(step, true);
}

$('#auth-switch').onclick = () => mode(!loginMode);
$('#onboarding').onsubmit = async event => {
  event.preventDefault();
  const value = $('#onboard-email').value.trim();
  const response = await fetch(loginMode ? '/api/login' : '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: value, password: $('#onboard-password').value }) });
  const data = await response.json();
  if (!response.ok) return $('#onboard-error').textContent = data.error;
  if (!data.user.emailVerified) return showVerification(data.user.email, data.verificationEmailSent);
  enter(value, 'resume');
};

$('#resend-verification').onclick = async () => {
  const button = $('#resend-verification'); button.disabled = true; button.textContent = '发送中…';
  const response = await fetch('/api/verification-email', { method: 'POST' }); const data = await response.json();
  button.disabled = false; button.textContent = '重新发送验证邮件';
  $('#verification-status').textContent = response.ok ? (data.verified ? '邮箱已经验证，可以继续使用。' : '验证邮件已重新发送，请检查收件箱和垃圾邮件。') : data.error;
};

$('#resume-next').onclick = async () => {
  let text = $('#resume-text').value.trim();
  const file = $('#resume-file').files[0];
  if (file) {
    const form = new FormData(); form.append('resume', file);
    const response = await fetch('/api/extract/resume', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) return $('#resume-error').textContent = data.error;
    text = data.text; $('#resume-text').value = text;
  }
  if (!text) return $('#resume-error').textContent = '请上传简历或粘贴简历文本。';
  try { await persistResume(text); } catch (error) { return $('#resume-error').textContent = error.message; }
  saveDraft({ resumeText: text }); go('facts');
};
$('#facts-next').onclick = async () => {
  const facts = $('#facts-text').value.trim();
  if (!facts) return $('#facts-error').textContent = '请确认或补充职业事实。';
  try { await persistResume(facts); } catch (error) { return $('#facts-error').textContent = error.message; }
  saveDraft({ facts }); go('job');
};
$('#job-next').onclick = async () => {
  let text = $('#job-text').value.trim();
  const file = $('#job-file').files[0];
  if (file && !text) {
    const form = new FormData(); form.append('screenshot', file);
    const response = await fetch('/api/extract/screenshot', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) return $('#job-error').textContent = data.error;
    text = data.text; $('#job-text').value = text;
    if (data.companyShortName) $('#company-short-name').value = data.companyShortName;
    if (data.jobTitle) $('#job-title').value = data.jobTitle;
  }
  if (!text) return $('#job-error').textContent = '请上传截图或粘贴职位描述。';
  const d = draft(); saveDraft({ jobText: text, companyShortName: $('#company-short-name').value.trim(), jobTitle: $('#job-title').value.trim() });
  const button = $('#job-next'); button.disabled = true; button.textContent = 'AI 分析中…';
  const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: d.facts || d.resumeText, jobText: text, companyShortName: $('#company-short-name').value, jobTitle: $('#job-title').value, email }) });
  const data = await response.json(); button.disabled = false; button.textContent = '确认岗位，生成报告';
  if (!response.ok) { if (data.code === 'EMAIL_NOT_VERIFIED') return showVerification(email); return $('#job-error').textContent = data.error; }
  saveDraft({ report: data.report, reportName: data.reportName, reportUrl: data.reportUrl, emailSent: data.emailSent });
  render(data.report, { reportName: data.reportName, reportUrl: data.reportUrl, emailSent: data.emailSent }); go('report');
};

function render(report, meta = {}) {
  $('#report-title').textContent = meta.reportName || draft().reportName || meta.jobTitle || draft().jobTitle || '岗位适配报告';
  $('#summary').textContent = report.summary || '';
  $('#qualification').innerHTML = `<div class="card"><strong>${safe(report.qualification?.status)}</strong><p>${safe(report.qualification?.evidence)}</p><p>${safe(report.qualification?.risks)}</p></div>`;
  $('#dimensions').innerHTML = (report.dimensions || []).map(item => `<div class="card"><strong>${safe(item.name)} · ${safe(item.score_0_to_5)}/5</strong><p>${safe(item.evidence)}</p><p>${safe(item.gap)}</p></div>`).join('');
  $('#rewrite').innerHTML = (report.resume_rewrite || []).map(item => `<div class="card"><strong>${safe(item.section)}</strong><p>${safe(item.original_issue)}</p><p>${safe(item.rewrite_direction)}</p><p>${safe(item.example)}</p></div>`).join('');
  $('#actions').innerHTML = (report.actions || []).map(item => `<li>${safe(item)}</li>`).join('');
  let box = $('#report-link-box');
  if (!box) { box = document.createElement('aside'); box.id = 'report-link-box'; box.className = 'report-link'; $('#summary').before(box); }
  if (meta.reportUrl) { box.innerHTML = `<strong>保存你的报告地址</strong><p>稍后可通过此地址重新查看，请勿公开分享。</p><div><input id="report-url" readonly value="${safe(meta.reportUrl)}"><button id="copy-report" class="secondary">复制地址</button></div><small>${meta.emailSent ? '地址已发送到注册邮箱。' : '邮件暂未发送，请先保存此地址。'}</small>`; $('#copy-report').onclick = async () => { await navigator.clipboard.writeText($('#report-url').value); $('#copy-report').textContent = '已复制'; }; }
}

document.querySelectorAll('[data-back]').forEach(button => button.onclick = () => go(button.dataset.back));
async function shared() { const match = location.pathname.match(/^\/report\/([^/]+)$/); if (!match) return false; $('#welcome').classList.add('hidden'); $('#flow').classList.remove('hidden'); const response = await fetch(`/api/reports/${encodeURIComponent(match[1])}`); const data = await response.json(); if (response.ok) render(data.report, { reportName: data.reportName, jobTitle: data.jobTitle }); else $('#summary').textContent = data.error; show('report'); return true; }
async function verifyEmailPage() {
  const match = location.pathname.match(/^\/verify-email\/([^/]+)$/); if (!match) return false;
  $('#welcome').classList.add('hidden'); $('#flow').classList.add('hidden'); $('#email-verification').classList.remove('hidden');
  $('#verification-copy').textContent = '正在确认验证链接…'; $('#verification-status').textContent = '';
  $('#resend-verification').classList.add('hidden');
  const response = await fetch('/api/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: match[1] }) }); const data = await response.json();
  $('#verification-title').textContent = response.ok ? '邮箱验证成功' : '验证链接不可用';
  $('#verification-copy').textContent = response.ok ? '你的邮箱已经完成验证，现在可以生成并接收岗位分析报告。' : data.error;
  $('#verification-status').textContent = response.ok ? '验证状态已保存到账号。' : '登录后可以重新发送验证邮件。';
  $('#verification-continue').classList.remove('hidden'); return true;
}
async function reportsPage() { if (location.pathname !== '/reports') return false; const session = await fetch('/api/session').then(response => response.json()); if (!session.authenticated) return false; email = session.user.email; document.querySelector('main').innerHTML = '<section class="flow"><div class="list-head"><div><p class="eyebrow">MY_REPORTS</p><h1>我的分析报告</h1></div><a class="primary nav-action" href="/facts">分析新岗位</a></div><div id="report-list" class="report-list"><p>正在加载报告…</p></div></section>'; const response = await fetch('/api/reports'); const data = await response.json(); const list = $('#report-list'); if (!response.ok) { list.innerHTML = `<p class="error">${safe(data.error)}</p>`; return true; } if (!data.reports.length) { list.innerHTML = '<div class="empty"><strong>还没有报告</strong><p>确认简历事实并提交目标岗位后，报告会保存在这里。</p><a href="/facts">开始第一次分析</a></div>'; return true; } const status = { completed: '已完成', analyzing: '分析中', failed: '失败' }, mail = { sent: '已发送', pending: '待发送', failed: '发送失败', not_configured: '未配置', unknown: '未知' }; list.innerHTML = data.reports.map(item => `<a class="report-row" href="${safe(item.reportUrl || '#')}"><div><strong>${safe(item.reportName)}</strong><small>${new Date(item.createdAt).toLocaleString('zh-CN')}</small></div><span class="status">${safe(status[item.status] || item.status)}</span><span class="mail">邮件：${safe(mail[item.emailStatus] || item.emailStatus)}</span></a>`).join(''); return true; }

const nav = document.createElement('a'); nav.href = '/reports'; nav.className = 'text-button reports-nav'; nav.textContent = '我的报告'; document.querySelector('header').append(nav);
window.onpopstate = () => enter(email, currentStep());
verifyEmailPage().then(async isVerification => { if (isVerification) return; const isList = await reportsPage(); if (isList) return; if (await shared()) return; const session = await fetch('/api/session').then(response => response.json()).catch(() => ({ authenticated: false })); if (session.authenticated) { if (!session.user.emailVerified) return showVerification(session.user.email); let d = draft(); const stored = await fetch('/api/resume').then(response => response.json()).catch(() => ({ hasResume: false })); if (stored.hasResume) { saveDraft({ resumeText: stored.text, facts: d.facts || stored.text }); d = draft(); } else if (d.resumeText) { await persistResume(d.resumeText).catch(() => {}); } let step = currentStep(); if (step === 'resume' && d.resumeText) step = 'facts'; if (step === 'facts' && !d.resumeText) step = 'resume'; if (step === 'job' && !d.facts) step = 'facts'; if (step === 'report' && !d.report) step = d.resumeText ? 'facts' : 'resume'; enter(session.user.email, step); } });
