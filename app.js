const legacyStorageKey = "sales-crm-prototype-v1";
const maxActivityPhotos = 3;
const maxPhotoBytes = 900_000;
const packageOptions = ["MCEO Lifetime", "MCEO One Year", "Offline Course", "Challenges"];
const mdsMonthLabels = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
let settings = {
  companyName: "Sales CRM",
  tagline: "团队销售工作台",
  monthTarget: 180000,
  stages: ["广告", "3天免费 Webinar", "Booster", "Closing", "Follow up"],
  statuses: [
    { name: "有兴趣", color: "#176b87", isWon: false },
    { name: "考虑中", color: "#16805c", isWon: false },
    { name: "暂停", color: "#b42318", isWon: false },
    { name: "已成交", color: "#b86e0f", isWon: true }
  ],
  activityTypes: ["通话", "微信", "会议", "备注"],
  logoDataUrl: "",
  ownerTargets: {}
};

let state = { customers: [], activities: [], payments: [] };
let currentUser = null;
let users = [];
let activeView = "dashboard";
let draggedStatusIndex = null;
let pendingLogoDataUrl = "";
let assistantRecognition = null;
let assistantListening = false;
let assistantLastResult = null;
const collapsedActivityCustomers = new Set();
const collapsedKanbanStages = new Set();

const els = {
  loginShell: document.querySelector("#loginShell"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  appShell: document.querySelector("#appShell"),
  pageTitle: document.querySelector("#pageTitle"),
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  search: document.querySelector("#globalSearch"),
  ownerFilter: document.querySelector("#ownerFilter"),
  stageOwnerFilter: document.querySelector("#stageOwnerFilter"),
  customerOwnerFilter: document.querySelector("#customerOwnerFilter"),
  paymentOwnerFilter: document.querySelector("#paymentOwnerFilter"),
  paymentStatusFilter: document.querySelector("#paymentStatusFilter"),
  activityOwnerFilter: document.querySelector("#activityOwnerFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  activityTypeFilter: document.querySelector("#activityTypeFilter"),
  customerDialog: document.querySelector("#customerDialog"),
  activityDialog: document.querySelector("#activityDialog"),
  paymentDialog: document.querySelector("#paymentDialog"),
  editUserDialog: document.querySelector("#editUserDialog"),
  customerForm: document.querySelector("#customerForm"),
  activityForm: document.querySelector("#activityForm"),
  paymentForm: document.querySelector("#paymentForm"),
  changePasswordForm: document.querySelector("#changePasswordForm"),
  userForm: document.querySelector("#userForm"),
  settingsForm: document.querySelector("#settingsForm"),
  statusBanner: document.querySelector("#statusBanner"),
  databaseStatus: document.querySelector("#databaseStatus"),
  backupFile: document.querySelector("#backupFile"),
  currentUserLabel: document.querySelector("#currentUserLabel"),
  currentRoleLabel: document.querySelector("#currentRoleLabel"),
  assistantCustomer: document.querySelector("#assistantCustomer"),
  assistantTone: document.querySelector("#assistantTone"),
  assistantTranscript: document.querySelector("#assistantTranscript"),
  assistantPrompt: document.querySelector("#assistantPrompt"),
  assistantResult: document.querySelector("#assistantResult"),
  assistantMicButton: document.querySelector("#assistantMicButton"),
  assistantSampleButton: document.querySelector("#assistantSampleButton"),
  assistantClearButton: document.querySelector("#assistantClearButton"),
  assistantCopyButton: document.querySelector("#assistantCopyButton"),
  assistantSaveButton: document.querySelector("#assistantSaveButton"),
  assistantMicStatus: document.querySelector("#assistantMicStatus")
};

const assistantRules = [
  {
    id: "price",
    label: "价格/预算异议",
    keywords: ["贵", "价钱", "价格", "budget", "expensive", "afford", "不值得", "太高", "没有钱", "分期", "便宜"],
    reply: {
      warm: "我明白，价格一定是要认真考虑的。通常会觉得贵，是因为还不确定它能不能解决你最在意的问题。我们先不急着决定，我想先确认：如果这个方案真的能帮你解决现在最困扰的部分，你会比较担心总价，还是付款安排？",
      direct: "明白，价格是重点。我们先把钱放旁边，如果结果和支持都适合你，你最大卡点是预算，还是你还没看到这个方案的价值？",
      premium: "我理解，高价值方案需要判断投资回报。我们可以先回到目标：你最想改善的结果是什么？如果方案对准这个目标，我再帮你看哪一个配套最合理。"
    },
    close: "如果我帮你把预算安排到比较舒服的方式，你今天可以先锁定这个方案吗？",
    next: ["确认客户真正卡在总价还是付款方式", "回到客户最想解决的问题", "只说明已确认的配套和付款条件"]
  },
  {
    id: "think",
    label: "考虑/拖延异议",
    keywords: ["考虑", "想一下", "回去想", "之后", "晚点", "下次", "再说", "think about", "consider", "later"],
    reply: {
      warm: "当然可以考虑。为了不要让你回去后越想越乱，我想先帮你整理一下：你现在最需要考虑的是价格、效果、时间，还是家人意见？",
      direct: "可以，那我们先把考虑点讲清楚。你现在不能决定的主要原因是哪一个？我处理完这个点，你会不会比较容易做决定？",
      premium: "没问题，好的决定需要清楚。我们先把你的顾虑拆开：目前是方案还不够清楚，还是你需要比较其他选择？"
    },
    close: "如果这个顾虑现在被解决，你会倾向今天开始，还是需要我安排一个明确 follow-up 时间？",
    next: ["不要接受模糊的“考虑”", "问出具体考虑点", "约定下一步时间或决定条件"]
  },
  {
    id: "partner",
    label: "家人/Partner 决策",
    keywords: ["老公", "老婆", "太太", "先生", "partner", "husband", "wife", "家人", "妈妈", "问他", "问她", "商量"],
    reply: {
      warm: "明白，重要决定跟家人商量是正常的。通常家人会问的是为什么需要、多少钱、有没有保障。我可以先帮你整理成简单三点，这样你回去比较容易解释。",
      direct: "可以问家人。那我先确认一下：如果家人没有反对，你自己对这个方案是愿意开始的吗？",
      premium: "当然可以。为了让沟通更有效，我建议我们先确认你个人的判断：你觉得这个方案适合你的地方和顾虑分别是什么？"
    },
    close: "如果我帮你准备一段给家人的说明，你愿意今天先保留名额/优惠，再回去确认吗？",
    next: ["先确认客户本人的意愿", "给客户一段可转述的价值说明", "避免让 partner 变成无限拖延理由"]
  },
  {
    id: "trust",
    label: "信任/证明异议",
    keywords: ["真的吗", "有效", "有没有用", "骗", "担心", "保障", "保证", "案例", "review", "trust", "proof", "results"],
    reply: {
      warm: "你的担心很合理，尤其是之前如果试过没有效果，就会更谨慎。我们不会乱保证结果，我可以先给你看适合你情况的案例和流程，让你判断这个方法是不是对。",
      direct: "这个点要看证据，不靠感觉。我先给你看我们的流程、案例和你目前情况的匹配点，然后你告诉我哪里还不放心。",
      premium: "这是专业判断，不应该靠承诺。我们会用诊断、流程和跟进标准来降低风险；我先说明我们能控制什么，不能承诺什么。"
    },
    close: "看完这些证据后，你还差哪一个信息才会放心开始？",
    next: ["承认顾虑合理", "展示流程/案例/诊断依据", "不要承诺百分百效果"]
  },
  {
    id: "competitor",
    label: "比较竞争对手",
    keywords: ["别人", "其他", "外面", "别家", "比较", "competitor", "another place", "cheaper", "package"],
    reply: {
      warm: "可以比较，这是很正常的。只是比较时不要只看价钱，要看适不适合你的问题、后续跟进、谁负责帮你调整。我们可以一起对比这几个点。",
      direct: "如果只是比价，一定有人更便宜。重点是你要买便宜，还是买一个比较有把握解决问题的方案？",
      premium: "我建议你用同一套标准比较：诊断准确度、方案完整度、后续服务和实际案例。这样会比单看价格更公平。"
    },
    close: "如果这几个关键点我们更符合你的需要，你会愿意优先选我们吗？",
    next: ["建立比较标准", "把焦点从低价拉回结果和服务", "问客户竞争对手吸引他的具体点"]
  },
  {
    id: "time",
    label: "时间/忙碌异议",
    keywords: ["忙", "没时间", "时间", "schedule", "busy", "赶", "下个月", "过后", "travel"],
    reply: {
      warm: "我明白，时间安排真的会影响执行。我们先看现实一点：你一周大概可以安排多少时间？我再帮你选不会太有压力的方式。",
      direct: "时间是关键。如果你真的想解决这个问题，我们需要找一个可执行的安排。你比较适合 weekday 还是 weekend？",
      premium: "我们可以按你的节奏设计，不一定要硬塞很多时间。重点是持续和跟进，我先帮你确认最稳的频率。"
    },
    close: "如果时间安排我帮你配好，你今天可以先确认开始日期吗？",
    next: ["把“没时间”变成具体排程问题", "提供低压力选项", "锁定开始日期"]
  },
  {
    id: "need",
    label: "需求不强/优先级低",
    keywords: ["不需要", "还好", "没有很严重", "暂时", "priority", "not urgent", "还可以", "先不要"],
    reply: {
      warm: "明白，如果现在感觉还可以，就不会急着做决定。我想问一个现实的问题：如果维持现在这样三个月，你觉得会更好、一样，还是更难处理？",
      direct: "可以不急，但我们要判断不处理的成本。这个问题如果继续拖，影响最大的是钱、时间，还是信心？",
      premium: "我们先不用急着推方案，先评估优先级。你希望三个月后看到什么改变？如果这个改变重要，我们再谈下一步。"
    },
    close: "如果你也觉得现在处理比之后处理更容易，我们可以先从入门方案开始吗？",
    next: ["制造未来对比", "让客户自己说出不处理成本", "推荐低门槛下一步"]
  }
];

const assistantFallback = {
  label: "需要澄清",
  reply: {
    warm: "我明白。为了不要答非所问，我想先确认一下：你现在最担心的是价格、效果、时间，还是需要跟别人商量？",
    direct: "我先确认重点。你现在卡住的原因是哪一个：预算、信任、时间，还是还没看到价值？",
    premium: "我先把问题厘清。你现在需要更多资料，还是你已经有一个具体顾虑想先解决？"
  },
  close: "你告诉我最主要的顾虑，我就可以帮你判断哪一个方案最适合。",
  next: ["先问澄清问题", "不要急着解释产品", "记录客户使用的原话"]
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = await response.text();
    }
    if (response.status === 401 && path !== "/api/login") showLogin();
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return response.json();
}

async function boot() {
  const session = await api("/api/me");
  settings = session.settings || settings;
  applySettings();
  if (session.user) {
    currentUser = session.user;
    showApp();
    await loadState();
  } else {
    showLogin();
  }
}

function showLogin() {
  currentUser = null;
  els.appShell.hidden = true;
  els.loginShell.hidden = false;
  els.loginUsername.focus();
}

function showApp() {
  els.loginShell.hidden = true;
  els.appShell.hidden = false;
  els.currentUserLabel.textContent = currentUser.displayName;
  els.currentRoleLabel.textContent = currentUser.role === "admin" ? "管理员" : "销售";
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.hidden = currentUser.role !== "admin";
  });
  document.querySelector("#customerOwner").disabled = currentUser.role !== "admin";
  els.ownerFilter.disabled = currentUser.role !== "admin";
  els.stageOwnerFilter.disabled = currentUser.role !== "admin";
  els.customerOwnerFilter.disabled = currentUser.role !== "admin";
  els.paymentOwnerFilter.disabled = currentUser.role !== "admin";
  els.activityOwnerFilter.disabled = currentUser.role !== "admin";
}

async function loadState() {
  state = await api("/api/state");
  settings = state.settings || settings;
  currentUser = state.user || currentUser;
  renderDatabaseStatus(state.meta);
  applySettings();
  showApp();
  render();
  await offerLegacyMigration();
  if (currentUser.role === "admin") await loadUsers();
}

function renderDatabaseStatus(meta = {}) {
  const databaseLabel = meta.database === "postgres"
    ? "Cloud Database · PostgreSQL"
    : "Local Database · SQLite";
  if (els.databaseStatus) {
    els.databaseStatus.textContent = `云端可部署 · ${databaseLabel} · 登录权限`;
  }
}

function applySettings() {
  document.title = `${settings.companyName} 工作台`;
  document.querySelectorAll(".brand-name").forEach((node) => {
    node.textContent = settings.companyName;
  });
  document.querySelectorAll(".brand-tagline").forEach((node) => {
    node.textContent = settings.tagline;
  });
  document.querySelectorAll(".brand-logo").forEach((image) => {
    image.hidden = false;
    image.src = settings.logoDataUrl || "./logo.png";
  });
  document.querySelector("#monthTarget").textContent = money(settings.monthTarget);
  document.querySelector("#kanbanBoard").style.gridTemplateColumns =
    `repeat(${getCustomerStages().length}, minmax(220px, 1fr))`;
  renderSettingsForm();
}

function renderSettingsForm() {
  if (!currentUser || currentUser.role !== "admin") return;
  document.querySelector("#settingCompanyName").value = settings.companyName;
  document.querySelector("#settingTagline").value = settings.tagline;
  document.querySelector("#settingMonthTarget").value = formatAmount(settings.monthTarget);
  document.querySelector("#settingStages").value = settings.stages.join("\n");
  document.querySelector("#settingActivityTypes").value = settings.activityTypes.join("\n");
  pendingLogoDataUrl = settings.logoDataUrl || "";
  renderLogoPreview();
  renderStatusSettings();
}

function renderLogoPreview() {
  const preview = document.querySelector("#settingLogoPreview");
  const removeButton = document.querySelector("#removeLogoSetting");
  preview.hidden = !pendingLogoDataUrl;
  removeButton.hidden = !pendingLogoDataUrl;
  if (pendingLogoDataUrl) preview.src = pendingLogoDataUrl;
}

function renderStatusSettings() {
  const list = document.querySelector("#statusSettingsList");
  list.innerHTML = settings.statuses
    .map(
      (status, index) => `
        <div class="status-setting-row" draggable="true" data-status-index="${index}">
          <button class="drag-handle" type="button" aria-label="拖动调整顺序" title="拖动调整顺序">☰</button>
          <input type="color" value="${escapeHtml(status.color)}" data-status-color="${index}" aria-label="状态颜色" />
          <input value="${escapeHtml(status.name)}" data-status-name="${index}" aria-label="状态名称" />
          <label class="won-toggle">
            <input type="checkbox" data-status-won="${index}" ${status.isWon ? "checked" : ""} />
            计入成交
          </label>
          <button class="icon-button" type="button" data-remove-status="${index}" aria-label="删除状态">×</button>
        </div>
      `
    )
    .join("");
}

function statusSettingsFromForm() {
  return [...document.querySelectorAll(".status-setting-row")].map((row) => ({
    name: row.querySelector("[data-status-name]").value.trim(),
    color: row.querySelector("[data-status-color]").value,
    isWon: row.querySelector("[data-status-won]").checked
  }));
}

function statusDefinition(name) {
  return settings.statuses.find((status) => status.name === name) || settings.statuses[0];
}

function isWonStatus(name) {
  return Boolean(statusDefinition(name)?.isWon || String(name).includes("成交"));
}

async function loadUsers() {
  const payload = await api("/api/users");
  users = payload.users;
  renderUsers();
}

async function offerLegacyMigration() {
  if (currentUser.role !== "admin") return;
  const saved = localStorage.getItem(legacyStorageKey);
  if (!saved || localStorage.getItem(`${legacyStorageKey}-db-migrated`)) return;

  try {
    const legacy = JSON.parse(saved);
    if (!Array.isArray(legacy.customers) || !Array.isArray(legacy.activities)) return;
    if (!legacy.customers.length && !legacy.activities.length) return;

    const confirmed = window.confirm(
      "发现以前存在浏览器里的 CRM 资料。要导入到 SQLite 数据库吗？这会替换目前数据库里的资料。"
    );
    if (!confirmed) {
      localStorage.setItem(`${legacyStorageKey}-db-migrated`, "skipped");
      return;
    }

    await api("/api/import", {
      method: "POST",
      body: JSON.stringify(legacy)
    });
    localStorage.setItem(`${legacyStorageKey}-db-migrated`, "done");
    showStatus("旧浏览器资料已经导入数据库。");
    await loadState();
  } catch (error) {
    showStatus(`旧资料导入失败：${error.message}`, true);
  }
}

function showStatus(message, isError = false) {
  els.statusBanner.textContent = message;
  els.statusBanner.classList.toggle("error", isError);
  els.statusBanner.hidden = false;
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    els.statusBanner.hidden = true;
  }, 4500);
}

function money(value) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function parseAmount(value) {
  const cleaned = String(value ?? "")
    .replaceAll(",", "")
    .replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function boosterMonthFromDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `MDS ${mdsMonthLabels[date.getMonth()]}`;
}

function currentMdsStages() {
  const currentMonth = new Date().getMonth();
  const stages = [];
  for (let month = currentMonth; month >= 0; month -= 1) {
    stages.push(`MDS ${mdsMonthLabels[month]}`);
  }
  return stages;
}

function mdsMonthIndex(stage) {
  const match = String(stage || "").trim().match(/^MDS\s+([A-Z]{3})$/i);
  if (!match) return -1;
  return mdsMonthLabels.indexOf(match[1].toUpperCase());
}

function mdsSortRank(stage) {
  const index = mdsMonthIndex(stage);
  if (index < 0) return 999;
  const currentMonth = new Date().getMonth();
  return index <= currentMonth ? currentMonth - index : 100 + index;
}

function ensureSelectOption(select, value) {
  if (!select || !value || [...select.options].some((option) => option.value === value)) return;
  select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
}

function paymentDayFromFirstPaymentDate(dateString) {
  if (!dateString) return 0;
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getDate();
}

function getCustomer(id) {
  return state.customers.find((customer) => customer.id === id);
}

function customerPayments(customerId) {
  return (state.payments || [])
    .filter((payment) => payment.customerId === customerId)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

function paymentPlanTotal(customer) {
  return Number(customer.totalAmount || customer.dealValue || 0);
}

function paymentPlanBeforeSst(customer) {
  const total = paymentPlanTotal(customer);
  if (!total) return 0;
  const sstRate = Number(customer.sstRate || 0);
  const firstPaymentBeforeSst = Number(customer.totalBeforeSst || 0);
  const firstPaymentInclSst = Number(customer.firstPayment || 0);
  const looksLikeSstIncluded = sstRate > 0 || (
    firstPaymentBeforeSst > 0 &&
    Math.abs(firstPaymentInclSst - firstPaymentBeforeSst * 1.08) < 0.02
  );
  return looksLikeSstIncluded ? total / (1 + (sstRate || 8) / 100) : total;
}

function loggedCollected(customer) {
  return customerPayments(customer.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function storedCollectedBeforeSst(customer) {
  const stored = Number(customer.collectedAmount || 0);
  const beforeSst = Number(customer.totalBeforeSst || 0);
  if (beforeSst > 0 && Math.abs(stored - beforeSst * 1.08) < 0.02) {
    return beforeSst;
  }
  return stored;
}

function collectedTotal(customer) {
  return Math.max(storedCollectedBeforeSst(customer), loggedCollected(customer));
}

function paymentBalance(customer) {
  return Math.max(paymentPlanBeforeSst(customer) - collectedTotal(customer), 0);
}

function addMonths(dateString, monthCount) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  date.setMonth(date.getMonth() + monthCount);
  if (date.getDate() !== day) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

function nextPaymentDue(customer) {
  if (paymentBalance(customer) <= 0) return "";
  const payments = customerPayments(customer.id);
  const loggedTerms = payments.filter((payment) => Number(payment.amount || 0) > 0).length;
  const hasFirstPayment = Number(customer.firstPayment || 0) > 0 || storedCollectedBeforeSst(customer) > 0;
  const paidTerms = Math.max(loggedTerms, hasFirstPayment ? 1 : 0);
  const terms = Number(customer.totalTerms || 0);
  if (terms > 0 && paidTerms >= terms) return "";
  const baseDate = customer.firstPaymentDate || customer.expectedClose || "";
  const nextDate = addMonths(baseDate, Math.max(paidTerms, 0));
  if (!nextDate) return "";
  const preferredDay = Number(customer.paymentDay || 0);
  if (preferredDay < 1) return nextDate;
  const date = new Date(`${nextDate}T00:00:00`);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(preferredDay, lastDay));
  return date.toISOString().slice(0, 10);
}

function paymentStatus(customer) {
  const dueDate = nextPaymentDue(customer);
  if (paymentBalance(customer) <= 0 && paymentPlanTotal(customer) > 0) {
    return { key: "complete", label: "已收完", tone: "success" };
  }
  if (!paymentPlanTotal(customer)) {
    return { key: "setup", label: "未设置付款计划", tone: "neutral" };
  }
  if (!dueDate) {
    return { key: "setup", label: "缺少付款日期", tone: "neutral" };
  }
  if (dueDate < todayISO()) {
    return { key: "overdue", label: "已逾期", tone: "danger" };
  }
  if (dueDate.slice(0, 7) === todayISO().slice(0, 7)) {
    return { key: "due", label: "本月应收", tone: "warning" };
  }
  return { key: "future", label: "未到期", tone: "neutral" };
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function previousMonthKey(currentKey) {
  const [year, month] = currentKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function daysInMonth(currentKey) {
  const [year, month] = currentKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function monthlyCollectedFor(customers, currentKey) {
  const customerIds = new Set(customers.map((customer) => customer.id));
  const paymentTotal = (state.payments || [])
    .filter((payment) => customerIds.has(payment.customerId))
    .filter((payment) => String(payment.paymentDate || "").startsWith(currentKey))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const manualCollected = customers
    .filter((customer) => !customerPayments(customer.id).length)
    .filter((customer) => isWonStatus(customer.status) && String(customer.firstPaymentDate || customer.expectedClose || "").startsWith(currentKey))
    .reduce((sum, customer) => sum + storedCollectedBeforeSst(customer), 0);
  return paymentTotal + manualCollected;
}

function customerWonDate(customer) {
  if (customer.firstPaymentDate) return customer.firstPaymentDate;
  const payments = customerPayments(customer.id);
  if (payments.length) return payments[payments.length - 1].paymentDate;
  return customer.expectedClose || "";
}

function wonCustomersFor(customers, currentKey = "") {
  return customers.filter((customer) => {
    if (!isWonStatus(customer.status)) return false;
    return !currentKey || String(customerWonDate(customer)).startsWith(currentKey);
  });
}

function getOwners() {
  return [...new Set(state.customers.map((customer) => customer.owner).filter(Boolean))].sort();
}

function getCustomerStages() {
  return [
    ...new Set([
      ...currentMdsStages(),
      ...settings.stages,
      ...state.customers.map((customer) => customer.stage)
    ].filter(Boolean))
  ].sort((a, b) => {
    const rankA = mdsSortRank(a);
    const rankB = mdsSortRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}

function queryText(customer) {
  return [
    customer.name,
    customer.phone,
    customer.email,
    customer.source,
    customer.status,
    customer.owner,
    customer.stage,
    customer.programPackage,
    customer.totalAmount,
    customer.collectedAmount,
    customer.note
  ]
    .join(" ")
    .toLowerCase();
}

function filteredCustomers() {
  const search = els.search.value.trim().toLowerCase();
  const owner = els.ownerFilter.value;
  const stageOwner = els.stageOwnerFilter.value;
  const customerOwner = els.customerOwnerFilter.value;
  const paymentOwner = els.paymentOwnerFilter.value;
  const status = els.statusFilter.value;
  const boosterMonth = els.sourceFilter.value;
  const selectedOwner =
    activeView === "pipeline"
      ? stageOwner
      : activeView === "customers"
        ? customerOwner
        : activeView === "payments"
          ? paymentOwner
          : owner;

  return state.customers.filter((customer) => {
    if (search && !queryText(customer).includes(search)) return false;
    if (selectedOwner !== "all" && customer.owner !== selectedOwner) return false;
    if (activeView === "customers" && status !== "all" && customer.status !== status) return false;
    if (activeView === "customers" && boosterMonth !== "all" && customer.stage !== boosterMonth) return false;
    return true;
  });
}

function renderSelectOptions() {
  const owners = getOwners();
  const boosterMonths = getCustomerStages();

  [els.ownerFilter, els.stageOwnerFilter, els.customerOwnerFilter, els.paymentOwnerFilter, els.activityOwnerFilter].forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="all">全部负责人</option>';
    owners.forEach((owner) => {
      select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`);
    });
    select.value = owners.includes(current) ? current : "all";
  });

  const currentBoosterMonth = els.sourceFilter.value;
  els.sourceFilter.innerHTML = '<option value="all">全部 Booster 月份</option>';
  boosterMonths.forEach((boosterMonth) => {
    els.sourceFilter.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(boosterMonth)}">${escapeHtml(boosterMonth)}</option>`
    );
  });
  els.sourceFilter.value = boosterMonths.includes(currentBoosterMonth) ? currentBoosterMonth : "all";

  const statusFilter = els.statusFilter;
  const currentStatusFilter = statusFilter.value;
  statusFilter.innerHTML = '<option value="all">全部状态</option>';
  settings.statuses.forEach((status) => {
    statusFilter.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(status.name)}">${escapeHtml(status.name)}</option>`
    );
  });
  statusFilter.value = settings.statuses.some((status) => status.name === currentStatusFilter)
    ? currentStatusFilter
    : "all";

  const customerStatus = document.querySelector("#customerStatus");
  const selectedCustomerStatus = customerStatus.value;
  customerStatus.innerHTML = "";
  settings.statuses.forEach((status) => {
    customerStatus.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(status.name)}">${escapeHtml(status.name)}</option>`
    );
  });
  customerStatus.value = settings.statuses.some((status) => status.name === selectedCustomerStatus)
    ? selectedCustomerStatus
    : settings.statuses[0].name;

  [document.querySelector("#activityType"), document.querySelector("#customerFollowUpType")].forEach((select) => {
    const current = select.value;
    select.innerHTML = "";
    settings.activityTypes.forEach((type) => {
      select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`);
    });
    select.value = settings.activityTypes.includes(current) ? current : settings.activityTypes[0];
  });

  const activityTypeFilter = els.activityTypeFilter;
  const currentActivityFilter = activityTypeFilter.value;
  activityTypeFilter.innerHTML = '<option value="all">全部类型</option>';
  settings.activityTypes.forEach((type) => {
    activityTypeFilter.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
    );
  });
  activityTypeFilter.value = settings.activityTypes.includes(currentActivityFilter)
    ? currentActivityFilter
    : "all";

  const dealStage = document.querySelector("#dealStage");
  const selectedDealStage = dealStage.value;
  dealStage.innerHTML = "";
  getCustomerStages().forEach((stage) => {
    dealStage.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`);
  });
  dealStage.value = [...dealStage.options].some((option) => option.value === selectedDealStage)
    ? selectedDealStage
    : dealStage.options[0]?.value || "";

  const activityCustomer = document.querySelector("#activityCustomer");
  const selectedActivityCustomer = activityCustomer.value;
  activityCustomer.innerHTML = "";
  state.customers.forEach((customer) => {
    activityCustomer.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`
    );
  });
  activityCustomer.value = state.customers.some((customer) => customer.id === selectedActivityCustomer)
    ? selectedActivityCustomer
    : state.customers[0]?.id || "";

  const paymentCustomer = document.querySelector("#paymentCustomer");
  const selectedPaymentCustomer = paymentCustomer.value;
  paymentCustomer.innerHTML = "";
  state.customers.forEach((customer) => {
    paymentCustomer.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)} · ${escapeHtml(customer.owner)}</option>`
    );
  });
  paymentCustomer.value = state.customers.some((customer) => customer.id === selectedPaymentCustomer)
    ? selectedPaymentCustomer
    : state.customers[0]?.id || "";
}

function renderDashboard() {
  const customers = state.customers;
  const dueToday = customers.filter((customer) => customer.nextFollowUp <= todayISO());
  const currentMonth = monthKey();
  const previousMonth = previousMonthKey(currentMonth);
  const monthlyWon = wonCustomersFor(customers, currentMonth);
  const allWon = wonCustomersFor(customers);
  const monthlyCollected = monthlyCollectedFor(customers, currentMonth);
  const previousCollected = monthlyCollectedFor(customers, previousMonth);
  const conversionRate = customers.length ? Math.round((allWon.length / customers.length) * 100) : 0;

  document.querySelector("#metricCustomers").textContent = customers.length;
  document.querySelector("#metricMonthlySales").textContent = money(monthlyCollected);
  document.querySelector("#metricMonthlyWon").textContent = monthlyWon.length;
  document.querySelector("#metricDue").textContent = dueToday.length;
  document.querySelector("#metricConversionRate").textContent = `${conversionRate}%`;

  const dashboardTarget =
    currentUser.role === "sales"
      ? Number(settings.ownerTargets[currentUser.ownerName] || settings.monthTarget)
      : Number(settings.monthTarget);
  const today = new Date();
  const elapsedDays = today.getDate();
  const forecast = monthlyCollected > 0
    ? Math.round((monthlyCollected / elapsedDays) * daysInMonth(currentMonth))
    : 0;
  const trendDifference = monthlyCollected - previousCollected;
  const trendLabel = previousCollected
    ? `${trendDifference >= 0 ? "+" : "-"}${money(Math.abs(trendDifference))} vs 上月`
    : "上月没有可比较数据";
  const forecastGap = forecast - dashboardTarget;
  document.querySelector("#metricForecast").textContent = money(forecast);
  document.querySelector("#metricForecastCopy").textContent =
    `${forecastGap >= 0 ? "预测可达标" : "预测差 " + money(Math.abs(forecastGap))} · ${trendLabel}`;

  const progress = dashboardTarget > 0 ? Math.min(Math.round((monthlyCollected / dashboardTarget) * 100), 100) : 0;
  const remaining = Math.max(dashboardTarget - monthlyCollected, 0);
  document.querySelector("#targetProgress").style.width = `${progress}%`;
  document.querySelector("#monthTarget").textContent = money(remaining);
  document.querySelector("#targetCopy").textContent =
    `Collected Before SST 目标 ${money(dashboardTarget)} · 已收 ${money(monthlyCollected)}（${progress}%）`;

  renderTeamList();
  renderDueList(dueToday);
}

function renderTeamList() {
  const list = document.querySelector("#teamList");
  const ownerFilter = els.ownerFilter.value;
  const availableOwners = getOwners();
  if (
    currentUser.role === "sales" &&
    currentUser.ownerName &&
    !availableOwners.includes(currentUser.ownerName)
  ) {
    availableOwners.push(currentUser.ownerName);
  }
  const owners = availableOwners
    .sort()
    .filter((owner) => ownerFilter === "all" || owner === ownerFilter);

  if (!owners.length) {
    list.innerHTML = '<div class="empty-state">还没有负责人资料。</div>';
    return;
  }

  const rows = owners
    .map((owner) => {
      const owned = state.customers.filter((customer) => customer.owner === owner);
      const due = owned.filter((customer) => customer.nextFollowUp <= todayISO()).length;
      const ownerActivities = state.activities.filter((activity) => activity.owner === owner).length;
      const ownerWon = wonCustomersFor(owned, monthKey());
      const allOwnerWon = wonCustomersFor(owned);
      const ownerCollected = monthlyCollectedFor(owned, monthKey());
      const ownerTarget = Number(settings.ownerTargets[owner] || settings.monthTarget);
      const rawPercent = ownerTarget > 0 ? Math.round((ownerCollected / ownerTarget) * 100) : 0;
      const percent = Math.min(rawPercent, 100);
      const gap = ownerCollected - ownerTarget;
      const conversion = owned.length ? Math.round((allOwnerWon.length / owned.length) * 100) : 0;
      return {
        owner,
        owned,
        due,
        ownerActivities,
        ownerWon,
        ownerCollected,
        ownerTarget,
        rawPercent,
        percent,
        gap,
        conversion
      };
    })
    .sort((a, b) => b.rawPercent - a.rawPercent || b.ownerCollected - a.ownerCollected);

  list.innerHTML = rows
    .map((row, index) => {
      const statusLabel = row.rawPercent >= 100 ? "超额/达标" : row.rawPercent >= 70 ? "接近目标" : "需要关注";
      return `
        <div class="team-row ${row.rawPercent >= 100 ? "is-ahead" : row.rawPercent < 50 ? "is-risk" : ""}">
          <div>
            <div class="owner-rank">#${index + 1}</div>
            <div class="owner-name">${escapeHtml(row.owner)}</div>
            <div class="owner-meta">${row.owned.length} 个客户 · ${row.ownerWon.length} 个本月成交 · ${row.due} 个待跟进</div>
          </div>
          <div>
            <div class="team-row-topline">
              <strong>${money(row.ownerCollected)}</strong>
              <span>${row.rawPercent}%</span>
            </div>
            <div class="mini-progress"><span style="width:${row.percent}%"></span></div>
            <div class="owner-meta">
              Before SST KPI ${money(row.ownerTarget)} · ${row.gap >= 0 ? "超出" : "还差"} ${money(Math.abs(row.gap))} · 转化率 ${row.conversion}% · ${row.ownerActivities} 条跟进
            </div>
          </div>
          <span class="team-status">${statusLabel}</span>
        </div>
      `;
    })
    .join("");
}

function renderDueList(items) {
  const list = document.querySelector("#dueList");
  const filtered = items.filter((customer) => {
    const owner = els.ownerFilter.value;
    return owner === "all" || customer.owner === owner;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">今天没有逾期或到期跟进。</div>';
    return;
  }

  list.innerHTML = filtered
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp))
    .map(
      (customer) => `
        <div class="due-item">
          <strong>${escapeHtml(customer.name)}</strong>
          <div class="customer-meta">${escapeHtml(customer.owner)} · ${escapeHtml(customer.stage)} · 下次跟进 ${escapeHtml(customer.nextFollowUp)}</div>
          <p>${escapeHtml(customer.note || "暂无备注")}</p>
        </div>
      `
    )
    .join("");
}

function renderKanban() {
  const customers = filteredCustomers();
  const board = document.querySelector("#kanbanBoard");

  board.innerHTML = getCustomerStages()
    .map((stage) => {
      const deals = customers.filter((customer) => customer.stage === stage);
      const collapsed = collapsedKanbanStages.has(stage);
      return `
        <section class="kanban-column ${collapsed ? "is-compact" : ""}">
          <div class="column-heading">
            <span>${escapeHtml(stage)}</span>
            <div class="column-heading-actions">
              <span class="count-pill">${deals.length}</span>
              <button class="collapse-button" type="button" data-toggle-stage="${escapeHtml(stage)}" aria-expanded="${String(!collapsed)}">
                ${collapsed ? "详细" : "简洁"}
              </button>
            </div>
          </div>
          <div class="kanban-column-body">
            ${
              deals.length
                ? deals
                    .map(
                      (customer) => `
                    <article class="deal-card" style="border-left-color:${escapeHtml(statusDefinition(customer.status).color)}">
                      <header>
                        <strong>${escapeHtml(customer.name)}</strong>
                      </header>
                      <dl class="deal-details">
                        <div><dt>负责人</dt><dd>${escapeHtml(customer.owner)}</dd></div>
                        <div><dt>状态</dt><dd>${escapeHtml(customer.status)}</dd></div>
                      </dl>
                      <div class="deal-actions">
                        <button type="button" data-edit="${escapeHtml(customer.id)}">编辑</button>
                      </div>
                    </article>
                  `
                    )
                    .join("")
                : '<div class="empty-state">暂无客户</div>'
            }
          </div>
        </section>
      `;
    })
    .join("");
}

function renderCustomerTable() {
  const table = document.querySelector("#customerTable");
  const customers = filteredCustomers();

  if (!customers.length) {
    table.innerHTML = '<tr><td colspan="9"><div class="empty-state">没有符合条件的客户。</div></td></tr>';
    return;
  }

  table.innerHTML = customers
    .map((customer) => {
      const status = statusDefinition(customer.status);
      return `
        <tr>
          <td>
            <strong>${escapeHtml(customer.name)}</strong>
            <div class="customer-meta">${escapeHtml(customer.email || "无邮箱")}</div>
          </td>
          <td>${escapeHtml(customer.phone)}</td>
          <td><span class="status-pill" style="background:${escapeHtml(status.color)};color:${contrastText(status.color)}">${escapeHtml(customer.status)}</span></td>
          <td>${escapeHtml(customer.owner)}</td>
          <td>${escapeHtml(customer.stage)}</td>
          <td>${escapeHtml(customer.nextFollowUp)}</td>
          <td>${paymentPlanBeforeSst(customer) ? money(paymentPlanBeforeSst(customer)) : "-"}</td>
          <td>${collectedTotal(customer) ? money(collectedTotal(customer)) : "-"}</td>
          <td>
            <div class="table-actions">
              <button type="button" data-edit="${escapeHtml(customer.id)}">编辑</button>
              <button type="button" data-add-activity="${escapeHtml(customer.id)}">跟进</button>
              <button type="button" data-delete="${escapeHtml(customer.id)}">删除</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderPayments() {
  const table = document.querySelector("#paymentTable");
  if (!table) return;

  const selectedStatus = els.paymentStatusFilter.value;
  const customers = filteredCustomers()
    .map((customer) => ({
      customer,
      status: paymentStatus(customer),
      total: paymentPlanTotal(customer),
      totalBeforeSst: paymentPlanBeforeSst(customer),
      paid: collectedTotal(customer),
      balance: paymentBalance(customer),
      nextDue: nextPaymentDue(customer),
      logs: customerPayments(customer.id)
    }))
    .filter((item) => selectedStatus === "all" || item.status.key === selectedStatus)
    .sort((a, b) => {
      if (!a.nextDue) return 1;
      if (!b.nextDue) return -1;
      return a.nextDue.localeCompare(b.nextDue);
    });

  const total = customers.reduce((sum, item) => sum + item.totalBeforeSst, 0);
  const paid = customers.reduce((sum, item) => sum + item.paid, 0);
  const balance = customers.reduce((sum, item) => sum + item.balance, 0);
  const due = customers.filter((item) => ["overdue", "due"].includes(item.status.key)).length;

  document.querySelector("#paymentMetricTotal").textContent = money(total);
  document.querySelector("#paymentMetricPaid").textContent = money(paid);
  document.querySelector("#paymentMetricBalance").textContent = money(balance);
  document.querySelector("#paymentMetricDue").textContent = due;

  if (!customers.length) {
    table.innerHTML = '<tr><td colspan="9"><div class="empty-state">没有符合条件的收款资料。</div></td></tr>';
    return;
  }

  table.innerHTML = customers
    .map(({ customer, status, totalBeforeSst, paid, balance, nextDue, logs }) => {
      const latestPayment = logs[0];
      const progress = totalBeforeSst > 0 ? Math.min(Math.round((paid / totalBeforeSst) * 100), 100) : 0;
      return `
        <tr>
          <td>
            <strong>${escapeHtml(customer.name)}</strong>
            <div class="customer-meta">${escapeHtml(customer.phone || "无电话")} · ${escapeHtml(customer.email || "无邮箱")}</div>
            ${latestPayment ? `<div class="customer-meta">最新收款 ${escapeHtml(latestPayment.paymentDate)} · ${money(latestPayment.amount)}</div>` : ""}
          </td>
          <td>${escapeHtml(customer.owner)}</td>
          <td>${escapeHtml(customer.programPackage || customer.source || "-")}</td>
          <td>${totalBeforeSst ? money(totalBeforeSst) : "-"}</td>
          <td>
            <strong>${money(paid)}</strong>
            <div class="payment-progress"><span style="width:${progress}%"></span></div>
          </td>
          <td>${balance ? money(balance) : "RM 0.00"}</td>
          <td>${nextDue || "-"}</td>
          <td><span class="payment-status ${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span></td>
          <td>
            <div class="table-actions">
              <button type="button" data-add-payment="${escapeHtml(customer.id)}">收款</button>
              <button type="button" data-edit="${escapeHtml(customer.id)}">编辑</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderActivities() {
  const timeline = document.querySelector("#activityTimeline");
  const type = els.activityTypeFilter.value;
  const owner = els.activityOwnerFilter.value;
  const search = els.search.value.trim().toLowerCase();
  const activities = state.activities
    .filter((activity) => type === "all" || activity.type === type)
    .filter((activity) => owner === "all" || activity.owner === owner)
    .filter((activity) => {
      const customer = getCustomer(activity.customerId);
      const haystack = [customer?.name, activity.type, activity.owner, activity.note].join(" ").toLowerCase();
      return !search || haystack.includes(search);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!activities.length) {
    timeline.innerHTML = '<div class="empty-state">还没有跟进记录。</div>';
    return;
  }

  const grouped = activities.reduce((groups, activity) => {
    const key = activity.customerId || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(activity);
    return groups;
  }, new Map());

  timeline.innerHTML = [...grouped.entries()]
    .map(([customerId, customerActivities]) => {
      const customer = getCustomer(customerId);
      const latestDate = customerActivities[0]?.date || "";
      const collapsed = collapsedActivityCustomers.has(customerId);
      return `
        <article class="timeline-item activity-group ${collapsed ? "is-collapsed" : ""}">
          <header class="activity-group-header">
            <div>
              <strong>${escapeHtml(customer?.name || "未知客户")}</strong>
              <div class="activity-meta">负责人 ${escapeHtml(customer?.owner || customerActivities[0]?.owner || "-")} · ${customerActivities.length} 条跟进 · 最新 update ${escapeHtml(latestDate)}</div>
            </div>
            <div class="activity-group-actions">
              <button class="collapse-button" type="button" data-toggle-activity-customer="${escapeHtml(customerId)}" aria-expanded="${String(!collapsed)}">
                ${collapsed ? "展开" : "缩小"}
              </button>
              ${customer ? `<button class="ghost-button" type="button" data-add-activity="${escapeHtml(customer.id)}">新增跟进</button>` : ""}
            </div>
          </header>
          <div class="activity-group-list">
            ${customerActivities
              .map(
                (activity) => `
                  <div class="activity-entry">
                    <strong>${escapeHtml(activity.date)} · ${escapeHtml(activity.type)}</strong>
                    <div class="activity-meta">${escapeHtml(activity.owner)}</div>
                    <p>${escapeHtml(activity.note || "只有照片，没有文字备注。")}</p>
                    ${activityPhotosHtml(activity.attachments, activity.date)}
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderUsers() {
  const list = document.querySelector("#userList");
  if (!users.length) {
    list.innerHTML = '<div class="empty-state">还没有团队账号。</div>';
    return;
  }

  const newTarget = document.querySelector("#newMonthlyTarget");
  if (newTarget && !newTarget.value) newTarget.value = formatAmount(settings.monthTarget);

  list.innerHTML = users
    .map(
      (user) => `
        <div class="user-row">
          <div>
            <strong>${escapeHtml(user.displayName)}</strong>
            <div class="owner-meta">@${escapeHtml(user.username)} · ${user.role === "admin" ? "管理员" : "销售"}</div>
            ${user.role === "sales" ? `<div class="owner-meta">Collected Before SST KPI ${money(user.monthlyTarget || settings.monthTarget)}</div>` : ""}
          </div>
          <div class="user-actions">
            <button class="ghost-button" type="button" data-edit-user="${escapeHtml(user.id)}">编辑</button>
            <button class="ghost-button" type="button" data-delete-user="${escapeHtml(user.id)}" ${user.id === currentUser.id ? "disabled" : ""}>删除</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderAssistantCustomers() {
  if (!els.assistantCustomer) return;
  const current = els.assistantCustomer.value;
  const options = state.customers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (customer) =>
        `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)} · ${escapeHtml(customer.status)} · ${escapeHtml(customer.stage)}</option>`
    )
    .join("");
  els.assistantCustomer.innerHTML = `<option value="">临时顾客</option>${options}`;
  els.assistantCustomer.value = state.customers.some((customer) => customer.id === current) ? current : "";
}

function customerAssistantContext(customer) {
  if (!customer) return "";
  const activities = state.activities
    .filter((activity) => activity.customerId === customer.id)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((activity) => `${activity.date} ${activity.type}: ${activity.note}`)
    .join("\n");
  return [
    `客户：${customer.name}`,
    `状态：${customer.status}`,
    `阶段：${customer.stage}`,
    customer.source ? `Batch：${customer.source}` : "",
    customer.boosterComment ? `Booster 备注：${customer.boosterComment}` : "",
    activities ? `最近跟进：\n${activities}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function scoreAssistantRule(text, rule) {
  return rule.keywords.reduce((score, keyword) => {
    const normalizedKeyword = keyword.toLowerCase();
    return text.includes(normalizedKeyword) ? score + Math.max(1, normalizedKeyword.length / 2) : score;
  }, 0);
}

function detectAssistantRule(transcript) {
  const text = transcript.toLowerCase();
  const scored = assistantRules
    .map((rule) => ({ rule, score: scoreAssistantRule(text, rule) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score <= 0) return { rule: assistantFallback, confidence: 42 };
  const secondScore = scored[1]?.score || 0;
  const confidence = Math.min(94, Math.round(58 + best.score * 8 + (best.score - secondScore) * 4));
  return { rule: best.rule, confidence };
}

function promptHints(prompt) {
  const cleaned = prompt.trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function analyzeAssistant() {
  if (!els.assistantTranscript) return null;
  const transcript = els.assistantTranscript.value.trim();
  const tone = els.assistantTone.value || "warm";
  const customer = getCustomer(els.assistantCustomer.value);
  const hints = promptHints(els.assistantPrompt.value);
  const detected = transcript ? detectAssistantRule(transcript) : { rule: assistantFallback, confidence: 0 };
  const rule = detected.rule;
  const context = customerAssistantContext(customer);
  const result = {
    label: transcript ? rule.label : "等待顾客输入",
    confidence: detected.confidence,
    reply: transcript
      ? rule.reply[tone] || rule.reply.warm
      : "先输入或听写顾客刚刚说的话，我会在这里生成 BA 可以直接讲的回复。",
    close: transcript ? rule.close : "顾客说出异议后，这里会出现下一句 closing question。",
    next: transcript ? rule.next : ["先记录顾客原话", "听出真正顾虑", "再引导下一步"],
    hints,
    context
  };
  assistantLastResult = result;
  return result;
}

function renderAssistant() {
  renderAssistantCustomers();
  if (!els.assistantResult) return;
  const result = analyzeAssistant();
  if (!result) return;
  const hintHtml = result.hints.length
    ? `<div class="assistant-card"><span>Prompt 重点</span><ul>${result.hints.map((hint) => `<li>${escapeHtml(hint)}</li>`).join("")}</ul></div>`
    : "";
  const contextHtml = result.context
    ? `<div class="assistant-card muted-card"><span>客户上下文</span><pre>${escapeHtml(result.context)}</pre></div>`
    : "";
  els.assistantResult.innerHTML = `
    <div class="assistant-diagnosis">
      <div>
        <span>异议类型</span>
        <strong>${escapeHtml(result.label)}</strong>
      </div>
      <div>
        <span>信心</span>
        <strong>${result.confidence ? `${result.confidence}%` : "-"}</strong>
      </div>
    </div>
    <div class="assistant-card highlight-card">
      <span>BA 可以这样说</span>
      <p>${escapeHtml(result.reply)}</p>
    </div>
    <div class="assistant-card">
      <span>下一句 Closing Question</span>
      <p>${escapeHtml(result.close)}</p>
    </div>
    <div class="assistant-card">
      <span>下一步动作</span>
      <ul>${result.next.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
    ${hintHtml}
    ${contextHtml}
    <div class="assistant-card guardrail-card">
      <span>提醒</span>
      <p>不要承诺无法保证的结果、隐藏费用或未经确认的折扣。顾客没有讲清楚时，先问澄清问题。</p>
    </div>
  `;
}

function render() {
  renderSelectOptions();
  renderDashboard();
  renderKanban();
  renderCustomerTable();
  renderPayments();
  renderActivities();
  renderAssistant();
  if (currentUser.role === "admin") renderUsers();
}

function setView(view) {
  if (view === "accounts" && currentUser.role !== "admin") view = "dashboard";
  activeView = view;
  const titles = {
    dashboard: "Dashboard",
    pipeline: "销售看板",
    customers: "客户状态",
    payments: "收款管理",
    activities: "跟进记录",
    assistant: "Closing Assistant",
    accounts: "团队账号",
    settings: "系统设置"
  };
  els.pageTitle.textContent = titles[view];
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  els.views.forEach((section) => section.classList.toggle("active-view", section.id === `${view}View`));
  render();
}

function openCustomerForm(id) {
  const customer = id ? getCustomer(id) : null;
  document.querySelector("#customerModalTitle").textContent = customer ? "编辑客户" : "新增客户";
  document.querySelector("#customerId").value = customer?.id || "";
  document.querySelector("#customerName").value = customer?.name || "";
  document.querySelector("#customerPhone").value = customer?.phone || "";
  document.querySelector("#customerEmail").value = customer?.email || "";
  document.querySelector("#customerSource").value = customer?.source || "";
  document.querySelector("#customerStatus").value = customer?.status || settings.statuses[0].name;
  document.querySelector("#customerOwner").value =
    customer?.owner || (currentUser.role === "sales" ? currentUser.ownerName : getOwners()[0] || "");
  document.querySelector("#dealValue").value = formatAmount(customer?.dealValue || 0);
  document.querySelector("#collectedAmount").value = formatAmount(customer?.collectedAmount || 0);
  setPackageValue(customer?.programPackage || "");
  const firstPaymentBeforeSst = Number(customer?.totalBeforeSst || 0)
    || (Number(customer?.firstPayment || customer?.collectedAmount || 0) / 1.08);
  document.querySelector("#paymentTotalBeforeSst").value = formatAmount(firstPaymentBeforeSst);
  document.querySelector("#paymentSstRate").value = "8";
  document.querySelector("#paymentTotalAmount").value = formatAmount(customer?.totalAmount || customer?.dealValue || 0);
  document.querySelector("#paymentFirstPaymentDate").value = customer?.firstPaymentDate || "";
  document.querySelector("#paymentMonthlyInstallment").value = formatAmount(customer?.monthlyInstallment || 0);
  document.querySelector("#paymentTotalTerms").value = customer?.totalTerms || "";
  document.querySelector("#expectedClose").value = customer?.expectedClose || todayISO();
  document.querySelector("#dealStage").value = customer?.stage || boosterMonthFromDate(document.querySelector("#expectedClose").value) || settings.stages[0];
  syncBoosterMonthFromDate();
  document.querySelector("#paymentDay").value = paymentDayFromFirstPaymentDate(document.querySelector("#paymentFirstPaymentDate").value);
  updateSstTotals();
  document.querySelector("#boosterComment").value = customer?.boosterComment || "";
  document.querySelector("#nextFollowUp").value = customer?.nextFollowUp || todayISO();
  document.querySelector("#customerFollowUpDate").value = todayISO();
  document.querySelector("#customerFollowUpType").value = settings.activityTypes[0];
  document.querySelector("#customerNote").value = "";
  document.querySelector("#customerAttachmentInput").value = "";
  updateAttachmentPreview("#customerAttachmentInput", "#customerAttachmentPreview");
  document.querySelector("#customerFormError").hidden = true;
  document.querySelector("#customerFormError").textContent = "";
  const saveButton = document.querySelector("#saveCustomerButton");
  saveButton.disabled = false;
  saveButton.textContent = "保存";
  updateDealValueVisibility();
  renderCustomerHistory(customer?.id);
  els.customerDialog.showModal();
}

function renderCustomerHistory(customerId) {
  const section = document.querySelector("#customerHistorySection");
  const list = document.querySelector("#customerActivityHistory");
  if (!customerId) {
    section.hidden = true;
    list.innerHTML = "";
    return;
  }

  section.hidden = false;
  const activities = state.activities
    .filter((activity) => activity.customerId === customerId)
    .sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = activities.length
    ? activities
        .map(
          (activity) => `
            <article class="history-item">
              <strong>${escapeHtml(activity.date)} · ${escapeHtml(activity.type)}</strong>
              <span>${escapeHtml(activity.owner)}</span>
              <p>${escapeHtml(activity.note)}</p>
              ${activityPhotosHtml(activity.attachments, activity.date)}
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">还没有跟进记录。</div>';
}

function setPackageValue(value = "") {
  const programSelect = document.querySelector("#paymentProgram");
  const otherField = document.querySelector("#paymentProgramOtherField");
  const otherInput = document.querySelector("#paymentProgramOther");
  if (packageOptions.includes(value)) {
    programSelect.value = value;
    otherInput.value = "";
  } else if (value) {
    programSelect.value = "Others";
    otherInput.value = value;
  } else {
    programSelect.value = packageOptions[0];
    otherInput.value = "";
  }
  otherField.hidden = programSelect.value !== "Others";
  otherInput.required = programSelect.value === "Others";
}

function selectedPackageValue() {
  const programSelect = document.querySelector("#paymentProgram");
  const otherInput = document.querySelector("#paymentProgramOther");
  return programSelect.value === "Others" ? otherInput.value.trim() : programSelect.value;
}

function updatePackageOtherVisibility() {
  const programSelect = document.querySelector("#paymentProgram");
  const otherField = document.querySelector("#paymentProgramOtherField");
  const otherInput = document.querySelector("#paymentProgramOther");
  otherField.hidden = programSelect.value !== "Others";
  otherInput.required = programSelect.value === "Others";
}

function updateSstTotals() {
  const beforeSst = parseAmount(document.querySelector("#paymentTotalBeforeSst").value);
  const sstAmount = beforeSst * 0.08;
  const totalCollected = beforeSst + sstAmount;
  document.querySelector("#paymentSstRate").value = "8";
  document.querySelector("#paymentSstAmount").value = formatAmount(sstAmount);
  document.querySelector("#paymentFirstPayment").value = formatAmount(totalCollected);
  document.querySelector("#collectedAmount").value = formatAmount(beforeSst);
}

function syncBoosterMonthFromDate() {
  const boosterMonth = boosterMonthFromDate(document.querySelector("#expectedClose").value);
  const dealStage = document.querySelector("#dealStage");
  ensureSelectOption(dealStage, boosterMonth);
  if (boosterMonth) dealStage.value = boosterMonth;
}

function openActivityForm(customerId = "") {
  document.querySelector("#activityCustomer").value = customerId || state.customers[0]?.id || "";
  document.querySelector("#activityType").value = settings.activityTypes[0];
  document.querySelector("#activityDate").value = todayISO();
  document.querySelector("#activityOwner").value =
    currentUser.role === "sales" ? currentUser.ownerName : getCustomer(customerId)?.owner || getOwners()[0] || "";
  document.querySelector("#activityOwner").disabled = currentUser.role !== "admin";
  document.querySelector("#activityNote").value = "";
  document.querySelector("#activityAttachmentInput").value = "";
  updateAttachmentPreview("#activityAttachmentInput", "#activityAttachmentPreview");
  els.activityDialog.showModal();
}

function openPaymentForm(customerId = "") {
  const customer = getCustomer(customerId) || state.customers[0];
  if (!customer) {
    showStatus("还没有客户，先新增客户后才可以记录收款。", true);
    return;
  }
  document.querySelector("#paymentCustomer").value = customer.id;
  document.querySelector("#paymentDate").value = todayISO();
  document.querySelector("#paymentTermNo").value = customerPayments(customer.id).length + 1;
  document.querySelector("#paymentAmount").value = formatAmount(customer.monthlyInstallment || paymentBalance(customer) || 0);
  document.querySelector("#paymentMethod").value = "";
  document.querySelector("#paymentSlipReceived").value = "Yes";
  document.querySelector("#paymentRemark").value = "";
  document.querySelector("#paymentFormError").hidden = true;
  els.paymentDialog.showModal();
}

async function deletePayment(id) {
  const payment = (state.payments || []).find((item) => item.id === id);
  if (!payment) return;
  const customer = getCustomer(payment.customerId);
  const confirmed = window.confirm(`确定删除 ${customer?.name || "这个客户"} 的 ${money(payment.amount)} 收款记录？`);
  if (!confirmed) return;
  await api(`/api/payments/${encodeURIComponent(id)}`, { method: "DELETE" });
  showStatus("收款记录已删除。");
  await loadState();
}

function updateDealValueVisibility() {
  const won = isWonStatus(document.querySelector("#customerStatus").value);
  const field = document.querySelector("#dealValueField");
  const collectedField = document.querySelector("#collectedAmountField");
  const input = document.querySelector("#dealValue");
  const collectedInput = document.querySelector("#collectedAmount");
  field.hidden = !won;
  collectedField.hidden = true;
  input.required = won;
  if (!won) {
    input.value = formatAmount(0);
    collectedInput.value = formatAmount(0);
  } else {
    updateSstTotals();
  }
}

async function deleteCustomer(id) {
  const customer = getCustomer(id);
  if (!customer) return;
  const confirmed = window.confirm(`确定删除 ${customer.name}？相关跟进记录也会删除。`);
  if (!confirmed) return;
  await api(`/api/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
  showStatus(`${customer.name} 已删除。`);
  await loadState();
}

async function exportBackup() {
  const backup = await api("/api/export");
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `sales-crm-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatus("Backup 已下载成 JSON 文件。");
}

async function importBackupFile(file) {
  if (!file) return;
  const text = await file.text();
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    showStatus("Import 失败：请选择有效的 JSON backup 文件。", true);
    return;
  }

  const count = backup.customers?.length || 0;
  const confirmed = window.confirm(`确定导入 ${count} 个客户？这会替换目前数据库里的资料。`);
  if (!confirmed) return;

  await api("/api/import", {
    method: "POST",
    body: JSON.stringify(backup)
  });
  showStatus("Backup 已导入数据库。");
  await loadState();
  els.backupFile.value = "";
}

async function createUser() {
  const payload = {
    username: document.querySelector("#newUsername").value.trim(),
    displayName: document.querySelector("#newDisplayName").value.trim(),
    role: document.querySelector("#newRole").value,
    ownerName: document.querySelector("#newDisplayName").value.trim(),
    password: document.querySelector("#newPassword").value,
    monthlyTarget: parseAmount(document.querySelector("#newMonthlyTarget").value)
  };
  if (users.some((user) => user.username.toLowerCase() === payload.username.toLowerCase())) {
    throw new Error(`用户名 ${payload.username} 已经存在，请使用另一个用户名。`);
  }
  await api("/api/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  els.userForm.reset();
  showStatus(`账号 ${payload.username} 已创建。`);
  await loadState();
}

function openEditUser(id) {
  const user = users.find((item) => item.id === id);
  if (!user) return;
  document.querySelector("#editUserId").value = user.id;
  document.querySelector("#editUsername").value = user.username;
  document.querySelector("#editUsername").disabled = user.id === currentUser.id;
  document.querySelector("#editDisplayName").value = user.displayName;
  document.querySelector("#editRole").value = user.role;
  document.querySelector("#editMonthlyTarget").value = formatAmount(
    user.monthlyTarget || settings.monthTarget
  );
  document.querySelector("#editPassword").value = "";
  document.querySelector("#editUserError").hidden = true;
  updateEditKpiVisibility();
  els.editUserDialog.showModal();
}

function updateEditKpiVisibility() {
  const input = document.querySelector("#editMonthlyTarget");
  const isSales = document.querySelector("#editRole").value === "sales";
  input.closest("label").hidden = !isSales;
  input.required = isSales;
}

async function saveEditedUser() {
  const userId = document.querySelector("#editUserId").value;
  const payload = {
    username: document.querySelector("#editUsername").value.trim(),
    displayName: document.querySelector("#editDisplayName").value.trim(),
    role: document.querySelector("#editRole").value,
    ownerName: document.querySelector("#editDisplayName").value.trim(),
    monthlyTarget: parseAmount(document.querySelector("#editMonthlyTarget").value),
    password: document.querySelector("#editPassword").value
  };
  await api(`/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  els.editUserDialog.close();
  showStatus(`账号 ${payload.username} 已更新。`);
  await loadState();
}

async function changeOwnPassword() {
  const currentPassword = document.querySelector("#currentPassword").value;
  const newPassword = document.querySelector("#newSelfPassword").value;
  const confirmPassword = document.querySelector("#confirmSelfPassword").value;
  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("请填写现在的密码和新密码。");
  }
  if (newPassword.length < 6) {
    throw new Error("新密码至少需要 6 个字符。");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("两次输入的新密码不一样。");
  }
  await api("/api/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword })
  });
  els.changePasswordForm.reset();
  showStatus("密码已更新，下次登录请使用新密码。");
}

async function deleteUser(id) {
  const user = users.find((item) => item.id === id);
  if (!user) return;
  if (!window.confirm(`确定删除账号 ${user.username}？`)) return;
  await api(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  showStatus(`账号 ${user.username} 已删除。`);
  await loadUsers();
}

async function saveSystemSettings() {
  const statuses = statusSettingsFromForm();
  const nextSettings = {
    companyName: document.querySelector("#settingCompanyName").value.trim(),
    tagline: document.querySelector("#settingTagline").value.trim(),
    monthTarget: parseAmount(document.querySelector("#settingMonthTarget").value),
    stages: document
      .querySelector("#settingStages")
      .value.split("\n")
      .map((stage) => stage.trim())
      .filter(Boolean),
    statuses,
    activityTypes: document
      .querySelector("#settingActivityTypes")
      .value.split("\n")
      .map((type) => type.trim())
      .filter(Boolean),
    logoDataUrl: pendingLogoDataUrl,
    ownerTargets: settings.ownerTargets
  };
  const payload = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(nextSettings)
  });
  settings = payload.settings;
  showStatus("系统设置已保存。");
  await loadState();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function contrastText(hexColor) {
  const hex = hexColor.replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#1d242d" : "#ffffff";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取 Logo 文件"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法处理照片"));
    image.src = dataUrl;
  });
}

function canvasToDataUrl(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("无法压缩照片"));
          return;
        }
        fileToDataUrl(blob).then(resolve).catch(reject);
      },
      "image/jpeg",
      quality
    );
  });
}

async function compressPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("照片只支持 JPG、PNG 或 WebP。");
  }
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 1200;
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.78;
  let compressed = await canvasToDataUrl(canvas, quality);
  while (compressed.length > maxPhotoBytes * 1.37 && quality > 0.45) {
    quality -= 0.08;
    compressed = await canvasToDataUrl(canvas, quality);
  }
  if (compressed.length > maxPhotoBytes * 1.37) {
    throw new Error(`${file.name} 太大，压缩后仍超过限制。`);
  }
  return {
    name: file.name,
    type: "image/jpeg",
    dataUrl: compressed
  };
}

async function attachmentsFromInput(selector) {
  const input = document.querySelector(selector);
  const files = [...(input.files || [])];
  if (files.length > maxActivityPhotos) {
    throw new Error(`每条跟进最多上传 ${maxActivityPhotos} 张照片。`);
  }
  return Promise.all(files.map((file) => compressPhoto(file)));
}

function updateAttachmentPreview(inputSelector, previewSelector) {
  const input = document.querySelector(inputSelector);
  const preview = document.querySelector(previewSelector);
  const files = [...(input.files || [])];
  if (!files.length) {
    preview.textContent = `最多 ${maxActivityPhotos} 张照片，每张会自动压缩。`;
    return;
  }
  preview.textContent = `已选择 ${files.length} 张：${files.map((file) => file.name).join("、")}`;
}

function activityPhotosHtml(attachments = [], date = "") {
  if (!attachments.length) return "";
  return `
    <div class="activity-photos">
      ${attachments
        .map(
          (photo) => `
            <a href="${photo.dataUrl}" target="_blank" rel="noopener" title="${escapeHtml(date ? `${date} · ${photo.name}` : photo.name)}">
              <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}" loading="lazy" />
              ${date ? `<span>${escapeHtml(date)}</span>` : ""}
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function assistantTextForClipboard() {
  const result = assistantLastResult || analyzeAssistant();
  if (!result) return "";
  return [
    `异议类型：${result.label}`,
    `BA 回复：${result.reply}`,
    `Closing Question：${result.close}`,
    `下一步：${result.next.join(" / ")}`
  ].join("\n");
}

async function copyAssistantReply() {
  const text = assistantTextForClipboard();
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const selection = window.getSelection();
    const holder = document.createElement("textarea");
    holder.value = text;
    holder.style.position = "fixed";
    holder.style.opacity = "0";
    document.body.appendChild(holder);
    holder.select();
    document.execCommand("copy");
    document.body.removeChild(holder);
    selection?.removeAllRanges();
  }
  showStatus("Closing Assistant 回复已复制。");
}

async function saveAssistantActivity() {
  const customerId = els.assistantCustomer.value;
  if (!customerId) {
    showStatus("请选择一个 CRM 客户，才能把建议存为跟进记录。", true);
    return;
  }
  const customer = getCustomer(customerId);
  const transcript = els.assistantTranscript.value.trim();
  const result = assistantLastResult || analyzeAssistant();
  if (!customer || !result || !transcript) {
    showStatus("先输入顾客原话，再保存跟进。", true);
    return;
  }
  await api("/api/activities", {
    method: "POST",
    body: JSON.stringify({
      customerId,
      type: settings.activityTypes[0],
      date: todayISO(),
      owner: customer.owner,
      note: [
        "Closing Assistant",
        `顾客原话：${transcript}`,
        `异议类型：${result.label}`,
        `建议回复：${result.reply}`,
        `Closing Question：${result.close}`
      ].join("\n")
    })
  });
  showStatus(`${customer.name} 的 closing 建议已存为跟进记录。`);
  await loadState();
}

function appendAssistantTranscript(text) {
  const clean = text.trim();
  if (!clean) return;
  const prefix = els.assistantTranscript.value.trim() ? "\n" : "";
  els.assistantTranscript.value += `${prefix}${clean}`;
  renderAssistant();
}

function setupAssistantSpeech() {
  if (!els.assistantMicButton) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.assistantMicButton.disabled = true;
    els.assistantMicStatus.textContent = "这个浏览器暂时不支持语音听写。你仍然可以粘贴顾客原话实时分析。";
    return;
  }
  assistantRecognition = new SpeechRecognition();
  assistantRecognition.lang = "zh-CN";
  assistantRecognition.continuous = true;
  assistantRecognition.interimResults = true;
  assistantRecognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    if (finalText) appendAssistantTranscript(finalText);
    els.assistantMicStatus.textContent = interimText ? `正在听：${interimText}` : "正在听写顾客讲话...";
  };
  assistantRecognition.onerror = (event) => {
    assistantListening = false;
    els.assistantMicButton.textContent = "开始听写";
    els.assistantMicStatus.textContent = `听写停止：${event.error || "浏览器无法取得麦克风"}`;
  };
  assistantRecognition.onend = () => {
    if (!assistantListening) {
      els.assistantMicButton.textContent = "开始听写";
      return;
    }
    assistantRecognition.start();
  };
}

function toggleAssistantSpeech() {
  if (!assistantRecognition) return;
  if (assistantListening) {
    assistantListening = false;
    assistantRecognition.stop();
    els.assistantMicButton.textContent = "开始听写";
    els.assistantMicStatus.textContent = "听写已停止。";
    return;
  }
  assistantListening = true;
  assistantRecognition.start();
  els.assistantMicButton.textContent = "停止听写";
  els.assistantMicStatus.textContent = "正在请求麦克风权限...";
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.hidden = true;
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsername.value,
        password: els.loginPassword.value
      })
    });
    currentUser = payload.user;
    els.loginPassword.value = "";
    showApp();
    await loadState();
  } catch (error) {
    els.loginError.textContent = error.message;
    els.loginError.hidden = false;
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin();
});

els.navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

[
  els.search,
  els.ownerFilter,
  els.stageOwnerFilter,
  els.customerOwnerFilter,
  els.paymentOwnerFilter,
  els.paymentStatusFilter,
  els.activityOwnerFilter,
  els.statusFilter,
  els.sourceFilter,
  els.activityTypeFilter
].forEach((control) => control.addEventListener("input", render));

[
  els.assistantCustomer,
  els.assistantTone,
  els.assistantTranscript,
  els.assistantPrompt
].forEach((control) => control?.addEventListener("input", renderAssistant));

els.assistantSampleButton?.addEventListener("click", () => {
  els.assistantTranscript.value =
    "我觉得这个配套有点贵，而且我想回去问我老公先。外面好像也有比较便宜的。";
  els.assistantPrompt.value ||= "先认同顾客，不硬 sell。\n不能保证结果，只能说明流程、案例和跟进。\n目标是问出真正顾虑并锁定下一步。";
  renderAssistant();
});

els.assistantClearButton?.addEventListener("click", () => {
  els.assistantTranscript.value = "";
  renderAssistant();
});

els.assistantCopyButton?.addEventListener("click", () => {
  copyAssistantReply().catch((error) => showStatus(error.message, true));
});

els.assistantSaveButton?.addEventListener("click", () => {
  saveAssistantActivity().catch((error) => showStatus(error.message, true));
});

els.assistantMicButton?.addEventListener("click", toggleAssistantSpeech);

document.querySelector("#customerStatus").addEventListener("change", updateDealValueVisibility);
document.querySelector("#expectedClose").addEventListener("change", syncBoosterMonthFromDate);
document.querySelector("#paymentProgram").addEventListener("change", updatePackageOtherVisibility);
document.querySelector("#paymentTotalBeforeSst").addEventListener("input", updateSstTotals);
document.querySelector("#paymentFirstPaymentDate").addEventListener("change", () => {
  document.querySelector("#paymentDay").value = paymentDayFromFirstPaymentDate(document.querySelector("#paymentFirstPaymentDate").value);
});
document.querySelector("#customerAttachmentInput").addEventListener("change", () => {
  updateAttachmentPreview("#customerAttachmentInput", "#customerAttachmentPreview");
});
document.querySelector("#activityAttachmentInput").addEventListener("change", () => {
  updateAttachmentPreview("#activityAttachmentInput", "#activityAttachmentPreview");
});

document.addEventListener("focusin", (event) => {
  if (!event.target.classList.contains("amount-input")) return;
  event.target.value = String(parseAmount(event.target.value) || "");
});

document.addEventListener("focusout", (event) => {
  if (!event.target.classList.contains("amount-input")) return;
  event.target.value = formatAmount(parseAmount(event.target.value));
});

document.querySelector("#openCustomerForm").addEventListener("click", () => openCustomerForm());
document.querySelector("#openActivityForm").addEventListener("click", () => openActivityForm());
document.querySelector("#exportBackup").addEventListener("click", () => exportBackup().catch((error) => showStatus(error.message, true)));
document.querySelector("#importBackup").addEventListener("click", () => els.backupFile.click());
els.backupFile.addEventListener("change", () =>
  importBackupFile(els.backupFile.files[0]).catch((error) => showStatus(error.message, true))
);

document.querySelector("#addStatusSetting").addEventListener("click", () => {
  settings.statuses = statusSettingsFromForm();
  settings.statuses.push({ name: "新状态", color: "#66717f", isWon: false });
  renderStatusSettings();
});

document.querySelector("#settingLogoFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    showStatus("Logo 只支持 PNG、JPG 或 WebP。", true);
    event.target.value = "";
    return;
  }
  if (file.size > 1_000_000) {
    showStatus("Logo 文件必须小于 1 MB。", true);
    event.target.value = "";
    return;
  }
  pendingLogoDataUrl = await fileToDataUrl(file);
  renderLogoPreview();
});

document.querySelector("#removeLogoSetting").addEventListener("click", () => {
  pendingLogoDataUrl = "";
  document.querySelector("#settingLogoFile").value = "";
  renderLogoPreview();
});

document.querySelector("#statusSettingsList").addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-status-index]");
  if (!row) return;
  settings.statuses = statusSettingsFromForm();
  draggedStatusIndex = Number(row.dataset.statusIndex);
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

document.querySelector("#statusSettingsList").addEventListener("dragover", (event) => {
  const row = event.target.closest("[data-status-index]");
  if (!row || draggedStatusIndex === null) return;
  event.preventDefault();
  row.classList.add("drag-over");
  event.dataTransfer.dropEffect = "move";
});

document.querySelector("#statusSettingsList").addEventListener("dragleave", (event) => {
  event.target.closest("[data-status-index]")?.classList.remove("drag-over");
});

document.querySelector("#statusSettingsList").addEventListener("drop", (event) => {
  const row = event.target.closest("[data-status-index]");
  if (!row || draggedStatusIndex === null) return;
  event.preventDefault();
  const targetIndex = Number(row.dataset.statusIndex);
  const [moved] = settings.statuses.splice(draggedStatusIndex, 1);
  settings.statuses.splice(targetIndex, 0, moved);
  draggedStatusIndex = null;
  renderStatusSettings();
});

document.querySelector("#statusSettingsList").addEventListener("dragend", () => {
  draggedStatusIndex = null;
  document.querySelectorAll(".status-setting-row").forEach((row) => {
    row.classList.remove("dragging", "drag-over");
  });
});

els.userForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createUser().catch((error) => showStatus(error.message, true));
});

document.querySelector("#editRole").addEventListener("change", updateEditKpiVisibility);

document.querySelector("#editUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#editUserError");
  error.hidden = true;
  try {
    await saveEditedUser();
  } catch (exception) {
    error.textContent = `保存失败：${exception.message}`;
    error.hidden = false;
  }
});

els.changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#changePasswordError");
  error.hidden = true;
  try {
    await changeOwnPassword();
  } catch (exception) {
    error.textContent = `保存失败：${exception.message}`;
    error.hidden = false;
  }
});

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSystemSettings().catch((error) => showStatus(error.message, true));
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    closeButton.closest("dialog").close();
    return;
  }

  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    openCustomerForm(editButton.dataset.edit);
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    deleteCustomer(deleteButton.dataset.delete).catch((error) => showStatus(error.message, true));
    return;
  }

  const activityButton = event.target.closest("[data-add-activity]");
  if (activityButton) {
    openActivityForm(activityButton.dataset.addActivity);
    return;
  }

  const paymentButton = event.target.closest("[data-add-payment]");
  if (paymentButton) {
    openPaymentForm(paymentButton.dataset.addPayment);
    return;
  }

  const deletePaymentButton = event.target.closest("[data-delete-payment]");
  if (deletePaymentButton) {
    deletePayment(deletePaymentButton.dataset.deletePayment).catch((error) => showStatus(error.message, true));
    return;
  }

  const toggleActivityButton = event.target.closest("[data-toggle-activity-customer]");
  if (toggleActivityButton) {
    const customerId = toggleActivityButton.dataset.toggleActivityCustomer;
    if (collapsedActivityCustomers.has(customerId)) {
      collapsedActivityCustomers.delete(customerId);
    } else {
      collapsedActivityCustomers.add(customerId);
    }
    renderActivities();
    return;
  }

  const toggleStageButton = event.target.closest("[data-toggle-stage]");
  if (toggleStageButton) {
    const stage = toggleStageButton.dataset.toggleStage;
    if (collapsedKanbanStages.has(stage)) {
      collapsedKanbanStages.delete(stage);
    } else {
      collapsedKanbanStages.add(stage);
    }
    renderKanban();
    return;
  }

  const deleteUserButton = event.target.closest("[data-delete-user]");
  if (deleteUserButton) {
    deleteUser(deleteUserButton.dataset.deleteUser).catch((error) => showStatus(error.message, true));
    return;
  }

  const editUserButton = event.target.closest("[data-edit-user]");
  if (editUserButton) {
    openEditUser(editUserButton.dataset.editUser);
    return;
  }

  const removeStatusButton = event.target.closest("[data-remove-status]");
  if (removeStatusButton) {
    settings.statuses = statusSettingsFromForm();
    if (settings.statuses.length <= 1) {
      showStatus("至少需要保留一个客户状态。", true);
      return;
    }
    settings.statuses.splice(Number(removeStatusButton.dataset.removeStatus), 1);
    renderStatusSettings();
  }
});

els.customerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formError = document.querySelector("#customerFormError");
  const saveButton = document.querySelector("#saveCustomerButton");
  formError.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = "保存中...";

  try {
    syncBoosterMonthFromDate();
    updateSstTotals();
    const dealValue = isWonStatus(document.querySelector("#customerStatus").value)
      ? parseAmount(document.querySelector("#dealValue").value)
      : 0;
    const firstPaymentBeforeSst = parseAmount(document.querySelector("#paymentTotalBeforeSst").value);
    const firstPaymentTotal = parseAmount(document.querySelector("#paymentFirstPayment").value);
    const customer = {
      id: document.querySelector("#customerId").value,
      name: document.querySelector("#customerName").value.trim(),
      phone: document.querySelector("#customerPhone").value.trim(),
      email: document.querySelector("#customerEmail").value.trim(),
      source: document.querySelector("#customerSource").value.trim(),
      status: document.querySelector("#customerStatus").value,
      owner: document.querySelector("#customerOwner").value.trim(),
      dealValue,
      collectedAmount: isWonStatus(document.querySelector("#customerStatus").value) ? firstPaymentBeforeSst : 0,
      programPackage: selectedPackageValue(),
      totalBeforeSst: firstPaymentBeforeSst,
      sstRate: 8,
      totalAmount: dealValue,
      firstPayment: firstPaymentTotal,
      firstPaymentDate: document.querySelector("#paymentFirstPaymentDate").value,
      monthlyInstallment: parseAmount(document.querySelector("#paymentMonthlyInstallment").value),
      totalTerms: Number(document.querySelector("#paymentTotalTerms").value || 0),
      paymentDay: paymentDayFromFirstPaymentDate(document.querySelector("#paymentFirstPaymentDate").value),
      stage: document.querySelector("#dealStage").value,
      expectedClose: document.querySelector("#expectedClose").value,
      boosterComment: document.querySelector("#boosterComment").value.trim(),
      nextFollowUp: document.querySelector("#nextFollowUp").value,
      note: document.querySelector("#customerNote").value.trim()
    };

    const requiredFields = [
      ["姓名", customer.name],
      ["电话", customer.phone],
      ["Batch", customer.source],
      ["状态", customer.status],
      ["负责人", customer.owner],
      ["Booster MDS 月份", customer.stage],
      ["Booster 日期", customer.expectedClose],
      ["下次跟进", customer.nextFollowUp]
    ];
    const missing = requiredFields.filter(([, value]) => !value).map(([label]) => label);
    if (missing.length) {
      throw new Error(`请填写：${missing.join("、")}`);
    }
    if (customer.email && !document.querySelector("#customerEmail").checkValidity()) {
      throw new Error("Email 格式不正确");
    }
    if (isWonStatus(customer.status) && customer.dealValue <= 0) {
      throw new Error("成交客户必须填写 Sales Amount Include SST");
    }
    if (document.querySelector("#paymentProgram").value === "Others" && !customer.programPackage) {
      throw new Error("请选择或填写 Program / Package");
    }

    const saved = await api("/api/customers", {
      method: "POST",
      body: JSON.stringify(customer)
    });
    const followUpNote = document.querySelector("#customerNote").value.trim();
    const followUpAttachments = await attachmentsFromInput("#customerAttachmentInput");
    els.customerDialog.close();
    await loadState();
    showStatus(`${customer.name} 已保存。`);

    if (followUpNote || followUpAttachments.length) {
      try {
        await api("/api/activities", {
          method: "POST",
          body: JSON.stringify({
            customerId: saved.customer.id,
            type: document.querySelector("#customerFollowUpType").value,
            date: document.querySelector("#customerFollowUpDate").value || todayISO(),
            owner: customer.owner,
            note: followUpNote,
            attachments: followUpAttachments
          })
        });
        await loadState();
        showStatus(`${customer.name} 和跟进记录已保存。`);
      } catch (activityError) {
        showStatus(`客户已保存，但跟进记录失败：${activityError.message}`, true);
      }
    }
  } catch (error) {
    formError.textContent = `保存失败：${error?.message || "未知错误，请通知管理员"}`;
    formError.hidden = false;
    saveButton.disabled = false;
    saveButton.textContent = "重新保存";
    formError.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

els.activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const activity = {
      customerId: document.querySelector("#activityCustomer").value,
      type: document.querySelector("#activityType").value,
      date: document.querySelector("#activityDate").value,
      owner: document.querySelector("#activityOwner").value.trim(),
      note: document.querySelector("#activityNote").value.trim(),
      attachments: await attachmentsFromInput("#activityAttachmentInput")
    };
    await api("/api/activities", {
      method: "POST",
      body: JSON.stringify(activity)
    });
    els.activityDialog.close();
    showStatus("跟进记录已保存到数据库。");
    await loadState();
  } catch (error) {
    showStatus(error.message, true);
  }
});

els.paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#paymentFormError");
  error.hidden = true;
  try {
    const payment = {
      customerId: document.querySelector("#paymentCustomer").value,
      paymentDate: document.querySelector("#paymentDate").value,
      termNo: Number(document.querySelector("#paymentTermNo").value || 0),
      amount: parseAmount(document.querySelector("#paymentAmount").value),
      method: document.querySelector("#paymentMethod").value.trim(),
      slipReceived: document.querySelector("#paymentSlipReceived").value,
      remark: document.querySelector("#paymentRemark").value.trim()
    };
    if (!payment.customerId || !payment.paymentDate || payment.amount <= 0) {
      throw new Error("请选择客户、收款日期，并填写大过 0 的 Amount Paid Before SST。");
    }
    await api("/api/payments", {
      method: "POST",
      body: JSON.stringify(payment)
    });
    els.paymentDialog.close();
    showStatus("收款记录已保存到数据库。");
    await loadState();
  } catch (exception) {
    error.textContent = `保存失败：${exception.message}`;
    error.hidden = false;
  }
});

setupAssistantSpeech();
boot().catch(() => showLogin());
