const legacyStorageKey = "sales-crm-prototype-v1";
const maxActivityPhotos = 3;
const maxPhotoBytes = 900_000;
let settings = {
  companyName: "Sales CRM",
  tagline: "团队销售工作台",
  monthTarget: 180000,
  stages: ["广告", "3天免费 Webinar", "Booster", "Closing", "Follow up"],
  statuses: [
    { name: "潜在客户", color: "#176b87", isWon: false },
    { name: "已成交", color: "#16805c", isWon: true },
    { name: "暂停", color: "#b42318", isWon: false }
  ],
  activityTypes: ["通话", "微信", "会议", "备注"],
  logoDataUrl: "",
  ownerTargets: {}
};

let state = { customers: [], activities: [] };
let currentUser = null;
let users = [];
let activeView = "dashboard";
let draggedStatusIndex = null;
let pendingLogoDataUrl = "";
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
  activityOwnerFilter: document.querySelector("#activityOwnerFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  activityTypeFilter: document.querySelector("#activityTypeFilter"),
  customerDialog: document.querySelector("#customerDialog"),
  activityDialog: document.querySelector("#activityDialog"),
  editUserDialog: document.querySelector("#editUserDialog"),
  customerForm: document.querySelector("#customerForm"),
  activityForm: document.querySelector("#activityForm"),
  changePasswordForm: document.querySelector("#changePasswordForm"),
  userForm: document.querySelector("#userForm"),
  settingsForm: document.querySelector("#settingsForm"),
  statusBanner: document.querySelector("#statusBanner"),
  backupFile: document.querySelector("#backupFile"),
  currentUserLabel: document.querySelector("#currentUserLabel"),
  currentRoleLabel: document.querySelector("#currentRoleLabel")
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
  els.activityOwnerFilter.disabled = currentUser.role !== "admin";
}

async function loadState() {
  state = await api("/api/state");
  settings = state.settings || settings;
  currentUser = state.user || currentUser;
  applySettings();
  showApp();
  render();
  await offerLegacyMigration();
  if (currentUser.role === "admin") await loadUsers();
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
    `repeat(${settings.stages.length}, minmax(220px, 1fr))`;
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

function getCustomer(id) {
  return state.customers.find((customer) => customer.id === id);
}

function getOwners() {
  return [...new Set(state.customers.map((customer) => customer.owner).filter(Boolean))].sort();
}

function getCustomerStages() {
  return [...new Set([...settings.stages, ...state.customers.map((customer) => customer.stage)].filter(Boolean))];
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
  const status = els.statusFilter.value;
  const boosterMonth = els.sourceFilter.value;
  const selectedOwner = activeView === "pipeline" ? stageOwner : activeView === "customers" ? customerOwner : owner;

  return state.customers.filter((customer) => {
    if (search && !queryText(customer).includes(search)) return false;
    if (selectedOwner !== "all" && customer.owner !== selectedOwner) return false;
    if (status !== "all" && customer.status !== status) return false;
    if (boosterMonth !== "all" && customer.stage !== boosterMonth) return false;
    return true;
  });
}

function renderSelectOptions() {
  const owners = getOwners();
  const boosterMonths = getCustomerStages();

  [els.ownerFilter, els.stageOwnerFilter, els.customerOwnerFilter, els.activityOwnerFilter].forEach((select) => {
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
  dealStage.innerHTML = "";
  settings.stages.forEach((stage) => {
    dealStage.insertAdjacentHTML("beforeend", `<option>${escapeHtml(stage)}</option>`);
  });

  const activityCustomer = document.querySelector("#activityCustomer");
  activityCustomer.innerHTML = "";
  state.customers.forEach((customer) => {
    activityCustomer.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`
    );
  });
}

function renderDashboard() {
  const customers = state.customers;
  const dueToday = customers.filter((customer) => customer.nextFollowUp <= todayISO());
  const currentMonth = todayISO().slice(0, 7);
  const monthlyWon = customers.filter(
    (customer) => isWonStatus(customer.status) && customer.expectedClose.startsWith(currentMonth)
  );
  const monthlySales = monthlyWon.reduce((sum, customer) => sum + Number(customer.dealValue || 0), 0);

  document.querySelector("#metricCustomers").textContent = customers.length;
  document.querySelector("#metricMonthlySales").textContent = money(monthlySales);
  document.querySelector("#metricMonthlyWon").textContent = monthlyWon.length;
  document.querySelector("#metricDue").textContent = dueToday.length;

  const dashboardTarget =
    currentUser.role === "sales"
      ? Number(settings.ownerTargets[currentUser.ownerName] || settings.monthTarget)
      : Number(settings.monthTarget);
  const progress = Math.min(Math.round((monthlySales / dashboardTarget) * 100), 100);
  const remaining = Math.max(dashboardTarget - monthlySales, 0);
  document.querySelector("#targetProgress").style.width = `${progress}%`;
  document.querySelector("#monthTarget").textContent = money(remaining);
  document.querySelector("#targetCopy").textContent =
    `目标 ${money(dashboardTarget)} · 已完成 ${money(monthlySales)}（${progress}%）`;

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

  list.innerHTML = owners
    .map((owner) => {
      const owned = state.customers.filter((customer) => customer.owner === owner);
      const due = owned.filter((customer) => customer.nextFollowUp <= todayISO()).length;
      const ownerActivities = state.activities.filter((activity) => activity.owner === owner).length;
      const ownerWon = owned.filter(
        (customer) => isWonStatus(customer.status) && customer.expectedClose.startsWith(todayISO().slice(0, 7))
      );
      const ownerSales = ownerWon.reduce((sum, customer) => sum + Number(customer.dealValue || 0), 0);
      const ownerTarget = Number(settings.ownerTargets[owner] || settings.monthTarget);
      const percent = Math.min(Math.round((ownerSales / ownerTarget) * 100), 100);

      return `
        <div class="team-row">
          <div>
            <div class="owner-name">${escapeHtml(owner)}</div>
            <div class="owner-meta">${owned.length} 个客户 · ${due} 个待跟进</div>
          </div>
          <div>
            <div class="mini-progress"><span style="width:${percent}%"></span></div>
            <div class="owner-meta">${money(ownerSales)} / KPI ${money(ownerTarget)} · ${ownerActivities} 条跟进</div>
          </div>
          <strong>${percent}%</strong>
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

  board.innerHTML = settings.stages
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
  const showDealValue = currentUser.role === "admin";

  if (!customers.length) {
    table.innerHTML = `<tr><td colspan="${showDealValue ? 8 : 7}"><div class="empty-state">没有符合条件的客户。</div></td></tr>`;
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
          ${showDealValue ? `<td>${isWonStatus(customer.status) ? money(customer.dealValue || 0) : "-"}</td>` : ""}
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
                    ${activityPhotosHtml(activity.attachments)}
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
            ${user.role === "sales" ? `<div class="owner-meta">KPI ${money(user.monthlyTarget || settings.monthTarget)}</div>` : ""}
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

function render() {
  renderSelectOptions();
  renderDashboard();
  renderKanban();
  renderCustomerTable();
  renderActivities();
  if (currentUser.role === "admin") renderUsers();
}

function setView(view) {
  if (view === "accounts" && currentUser.role !== "admin") view = "dashboard";
  activeView = view;
  const titles = {
    dashboard: "Dashboard",
    pipeline: "销售看板",
    customers: "客户状态",
    activities: "跟进记录",
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
  document.querySelector("#dealStage").value = customer?.stage || settings.stages[0];
  document.querySelector("#dealValue").value = formatAmount(customer?.dealValue || 0);
  document.querySelector("#expectedClose").value = customer?.expectedClose || todayISO();
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
              ${activityPhotosHtml(activity.attachments)}
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">还没有跟进记录。</div>';
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

function updateDealValueVisibility() {
  const won = isWonStatus(document.querySelector("#customerStatus").value);
  const field = document.querySelector("#dealValueField");
  const input = document.querySelector("#dealValue");
  field.hidden = !won;
  input.required = won;
  if (!won) input.value = formatAmount(0);
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

function activityPhotosHtml(attachments = []) {
  if (!attachments.length) return "";
  return `
    <div class="activity-photos">
      ${attachments
        .map(
          (photo) => `
            <a href="${photo.dataUrl}" target="_blank" rel="noopener" title="${escapeHtml(photo.name)}">
              <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}" loading="lazy" />
            </a>
          `
        )
        .join("")}
    </div>
  `;
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
  els.activityOwnerFilter,
  els.statusFilter,
  els.sourceFilter,
  els.activityTypeFilter
].forEach((control) => control.addEventListener("input", render));

document.querySelector("#customerStatus").addEventListener("change", updateDealValueVisibility);
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
    const customer = {
      id: document.querySelector("#customerId").value,
      name: document.querySelector("#customerName").value.trim(),
      phone: document.querySelector("#customerPhone").value.trim(),
      email: document.querySelector("#customerEmail").value.trim(),
      source: document.querySelector("#customerSource").value.trim(),
      status: document.querySelector("#customerStatus").value,
      owner: document.querySelector("#customerOwner").value.trim(),
      dealValue: isWonStatus(document.querySelector("#customerStatus").value)
        ? parseAmount(document.querySelector("#dealValue").value)
        : 0,
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
      throw new Error("成交客户必须填写 Sales Amount");
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

boot().catch(() => showLogin());
