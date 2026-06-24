const legacyStorageKey = "sales-crm-prototype-v1";
let settings = {
  companyName: "Sales CRM",
  tagline: "团队销售工作台",
  monthTarget: 180000,
  stages: ["广告", "3天免费 Webinar", "Booster", "Closing", "Follow up"]
};

let state = { customers: [], activities: [] };
let currentUser = null;
let users = [];
let activeView = "dashboard";

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
  statusFilter: document.querySelector("#statusFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  activityTypeFilter: document.querySelector("#activityTypeFilter"),
  customerDialog: document.querySelector("#customerDialog"),
  activityDialog: document.querySelector("#activityDialog"),
  customerForm: document.querySelector("#customerForm"),
  activityForm: document.querySelector("#activityForm"),
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
  document.querySelector("#monthTarget").textContent = money(settings.monthTarget);
  document.querySelector("#pipelineFlowTitle").textContent = settings.stages.join(" → ");
  document.querySelector("#kanbanBoard").style.gridTemplateColumns =
    `repeat(${settings.stages.length}, minmax(220px, 1fr))`;
  renderSettingsForm();
}

function renderSettingsForm() {
  if (!currentUser || currentUser.role !== "admin") return;
  document.querySelector("#settingCompanyName").value = settings.companyName;
  document.querySelector("#settingTagline").value = settings.tagline;
  document.querySelector("#settingMonthTarget").value = settings.monthTarget;
  document.querySelector("#settingStages").value = settings.stages.join("\n");
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
    maximumFractionDigits: 0
  }).format(Number(value || 0));
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

function getSources() {
  return [...new Set(state.customers.map((customer) => customer.source).filter(Boolean))].sort();
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
  const status = els.statusFilter.value;
  const source = els.sourceFilter.value;
  const selectedOwner = activeView === "pipeline" ? stageOwner : owner;

  return state.customers.filter((customer) => {
    if (search && !queryText(customer).includes(search)) return false;
    if (selectedOwner !== "all" && customer.owner !== selectedOwner) return false;
    if (status !== "all" && customer.status !== status) return false;
    if (source !== "all" && customer.source !== source) return false;
    return true;
  });
}

function renderSelectOptions() {
  const owners = getOwners();
  const sources = getSources();

  [els.ownerFilter, els.stageOwnerFilter].forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="all">全部负责人</option>';
    owners.forEach((owner) => {
      select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`);
    });
    select.value = owners.includes(current) ? current : "all";
  });

  const currentSource = els.sourceFilter.value;
  els.sourceFilter.innerHTML = '<option value="all">全部来源</option>';
  sources.forEach((source) => {
    els.sourceFilter.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`
    );
  });
  els.sourceFilter.value = sources.includes(currentSource) ? currentSource : "all";

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
  const openDeals = customers.filter((customer) => !["已成交", "已流失"].includes(customer.stage));
  const wonDeals = customers.filter((customer) => customer.status === "客户");
  const dueToday = customers.filter((customer) => customer.nextFollowUp <= todayISO());
  const pipelineTotal = openDeals.reduce((sum, customer) => sum + Number(customer.dealValue || 0), 0);
  const wonTotal = wonDeals.reduce((sum, customer) => sum + Number(customer.dealValue || 0), 0);

  document.querySelector("#metricCustomers").textContent = customers.length;
  document.querySelector("#metricPipeline").textContent = money(pipelineTotal);
  document.querySelector("#metricWon").textContent = money(wonTotal);
  document.querySelector("#metricDue").textContent = dueToday.length;

  const progress = Math.min(Math.round((wonTotal / settings.monthTarget) * 100), 100);
  document.querySelector("#targetProgress").style.width = `${progress}%`;
  document.querySelector("#targetCopy").textContent =
    `${progress}% 已完成，距离目标还差 ${money(Math.max(settings.monthTarget - wonTotal, 0))}`;

  renderTeamList();
  renderDueList(dueToday);
}

function renderTeamList() {
  const list = document.querySelector("#teamList");
  const ownerFilter = els.ownerFilter.value;
  const owners = getOwners().filter((owner) => ownerFilter === "all" || owner === ownerFilter);

  if (!owners.length) {
    list.innerHTML = '<div class="empty-state">还没有负责人资料。</div>';
    return;
  }

  list.innerHTML = owners
    .map((owner) => {
      const owned = state.customers.filter((customer) => customer.owner === owner);
      const total = owned.reduce((sum, customer) => sum + Number(customer.dealValue || 0), 0);
      const due = owned.filter((customer) => customer.nextFollowUp <= todayISO()).length;
      const closing = owned.filter((customer) => customer.stage === "Closing").length;
      const percent = Math.min(Math.round((total / settings.monthTarget) * 100), 100);

      return `
        <div class="team-row">
          <div>
            <div class="owner-name">${escapeHtml(owner)}</div>
            <div class="owner-meta">${owned.length} 个客户 · ${due} 个待跟进</div>
          </div>
          <div>
            <div class="mini-progress"><span style="width:${percent}%"></span></div>
            <div class="owner-meta">${money(total)} pipeline · ${closing} 个 Closing</div>
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
      const total = deals.reduce((sum, customer) => sum + Number(customer.dealValue || 0), 0);
      return `
        <section class="kanban-column">
          <div class="column-heading">
            <span>${escapeHtml(stage)}</span>
            <span class="count-pill">${deals.length} · ${money(total)}</span>
          </div>
          ${
            deals.length
              ? deals
                  .map(
                    (customer) => `
                    <article class="deal-card">
                      <header>
                        <strong>${escapeHtml(customer.name)}</strong>
                        <span class="deal-value">${money(customer.dealValue)}</span>
                      </header>
                      <div class="deal-meta">${escapeHtml(customer.owner)} · ${escapeHtml(customer.source)}</div>
                      <div class="deal-meta">预计成交 ${escapeHtml(customer.expectedClose)}</div>
                      <div class="deal-actions">
                        <button type="button" data-move="${escapeHtml(customer.id)}" data-direction="-1">←</button>
                        <button type="button" data-edit="${escapeHtml(customer.id)}">编辑</button>
                        <button type="button" data-move="${escapeHtml(customer.id)}" data-direction="1">→</button>
                      </div>
                    </article>
                  `
                  )
                  .join("")
              : '<div class="empty-state">暂无机会</div>'
          }
        </section>
      `;
    })
    .join("");
}

function renderCustomerTable() {
  const table = document.querySelector("#customerTable");
  const customers = filteredCustomers();

  if (!customers.length) {
    table.innerHTML = '<tr><td colspan="8"><div class="empty-state">没有符合条件的客户。</div></td></tr>';
    return;
  }

  table.innerHTML = customers
    .map((customer) => {
      const statusClass = customer.status === "客户" ? "customer" : customer.status === "暂停" ? "paused" : "";
      return `
        <tr>
          <td>
            <strong>${escapeHtml(customer.name)}</strong>
            <div class="customer-meta">${escapeHtml(customer.email || "无邮箱")}</div>
          </td>
          <td>${escapeHtml(customer.phone)}</td>
          <td>${escapeHtml(customer.source)}</td>
          <td><span class="status-pill ${statusClass}">${escapeHtml(customer.status)}</span></td>
          <td>${escapeHtml(customer.owner)}</td>
          <td>${money(customer.dealValue)}<div class="customer-meta">${escapeHtml(customer.stage)}</div></td>
          <td>${escapeHtml(customer.nextFollowUp)}</td>
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
  const search = els.search.value.trim().toLowerCase();
  const activities = state.activities
    .filter((activity) => type === "all" || activity.type === type)
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

  timeline.innerHTML = activities
    .map((activity) => {
      const customer = getCustomer(activity.customerId);
      return `
        <article class="timeline-item">
          <strong>${escapeHtml(customer?.name || "未知客户")} · ${escapeHtml(activity.type)}</strong>
          <div class="activity-meta">${escapeHtml(activity.date)} · ${escapeHtml(activity.owner)}</div>
          <p>${escapeHtml(activity.note)}</p>
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

  list.innerHTML = users
    .map(
      (user) => `
        <div class="user-row">
          <div>
            <strong>${escapeHtml(user.displayName)}</strong>
            <div class="owner-meta">@${escapeHtml(user.username)} · ${user.role === "admin" ? "管理员" : "销售"} · ${escapeHtml(user.ownerName || "-")}</div>
          </div>
          <button class="ghost-button" type="button" data-delete-user="${escapeHtml(user.id)}" ${user.id === currentUser.id ? "disabled" : ""}>删除</button>
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
  if (["accounts", "settings"].includes(view) && currentUser.role !== "admin") view = "dashboard";
  activeView = view;
  const titles = {
    dashboard: "Dashboard",
    pipeline: "销售看板",
    customers: "客户与线索",
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
  document.querySelector("#customerSource").value = customer?.source || "Facebook 广告";
  document.querySelector("#customerStatus").value = customer?.status || "潜在客户";
  document.querySelector("#customerOwner").value =
    customer?.owner || (currentUser.role === "sales" ? currentUser.ownerName : getOwners()[0] || "");
  document.querySelector("#dealValue").value = customer?.dealValue || 0;
  document.querySelector("#dealStage").value = customer?.stage || settings.stages[0];
  document.querySelector("#expectedClose").value = customer?.expectedClose || todayISO();
  document.querySelector("#nextFollowUp").value = customer?.nextFollowUp || todayISO();
  document.querySelector("#customerNote").value = customer?.note || "";
  els.customerDialog.showModal();
}

function openActivityForm(customerId = "") {
  document.querySelector("#activityCustomer").value = customerId || state.customers[0]?.id || "";
  document.querySelector("#activityType").value = "通话";
  document.querySelector("#activityDate").value = todayISO();
  document.querySelector("#activityOwner").value =
    currentUser.role === "sales" ? currentUser.ownerName : getCustomer(customerId)?.owner || getOwners()[0] || "";
  document.querySelector("#activityOwner").disabled = currentUser.role !== "admin";
  document.querySelector("#activityNote").value = "";
  els.activityDialog.showModal();
}

async function moveStage(id, direction) {
  const customer = getCustomer(id);
  if (!customer) return;
  const currentIndex = settings.stages.indexOf(customer.stage);
  const nextIndex = Math.min(Math.max(currentIndex + Number(direction), 0), settings.stages.length - 1);
  await api(`/api/customers/${encodeURIComponent(id)}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage: settings.stages[nextIndex] })
  });
  await loadState();
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
    ownerName: document.querySelector("#newOwnerName").value.trim(),
    password: document.querySelector("#newPassword").value
  };
  if (users.some((user) => user.username.toLowerCase() === payload.username.toLowerCase())) {
    throw new Error(`用户名 ${payload.username} 已经存在，请使用另一个用户名。`);
  }
  if (payload.role === "sales" && !payload.ownerName) payload.ownerName = payload.displayName;
  await api("/api/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  els.userForm.reset();
  showStatus(`账号 ${payload.username} 已创建。`);
  await loadUsers();
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
  const nextSettings = {
    companyName: document.querySelector("#settingCompanyName").value.trim(),
    tagline: document.querySelector("#settingTagline").value.trim(),
    monthTarget: Number(document.querySelector("#settingMonthTarget").value),
    stages: document
      .querySelector("#settingStages")
      .value.split("\n")
      .map((stage) => stage.trim())
      .filter(Boolean)
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
  els.statusFilter,
  els.sourceFilter,
  els.activityTypeFilter
].forEach((control) => control.addEventListener("input", render));

document.querySelector("#openCustomerForm").addEventListener("click", () => openCustomerForm());
document.querySelector("#openActivityForm").addEventListener("click", () => openActivityForm());
document.querySelector("#exportBackup").addEventListener("click", () => exportBackup().catch((error) => showStatus(error.message, true)));
document.querySelector("#importBackup").addEventListener("click", () => els.backupFile.click());
els.backupFile.addEventListener("change", () =>
  importBackupFile(els.backupFile.files[0]).catch((error) => showStatus(error.message, true))
);

document.querySelector("#seedButton").addEventListener("click", async () => {
  if (!window.confirm("这会清除当前数据库里的 CRM 资料，确定重置成示例数据？")) return;
  await api("/api/reset", { method: "POST" });
  showStatus("数据库已重置成示例数据。");
  await loadState();
});

els.userForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createUser().catch((error) => showStatus(error.message, true));
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

  const moveButton = event.target.closest("[data-move]");
  if (moveButton) {
    moveStage(moveButton.dataset.move, moveButton.dataset.direction).catch((error) => showStatus(error.message, true));
    return;
  }

  const deleteUserButton = event.target.closest("[data-delete-user]");
  if (deleteUserButton) {
    deleteUser(deleteUserButton.dataset.deleteUser).catch((error) => showStatus(error.message, true));
  }
});

els.customerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const customer = {
    id: document.querySelector("#customerId").value,
    name: document.querySelector("#customerName").value.trim(),
    phone: document.querySelector("#customerPhone").value.trim(),
    email: document.querySelector("#customerEmail").value.trim(),
    source: document.querySelector("#customerSource").value.trim(),
    status: document.querySelector("#customerStatus").value,
    owner: document.querySelector("#customerOwner").value.trim(),
    dealValue: Number(document.querySelector("#dealValue").value || 0),
    stage: document.querySelector("#dealStage").value,
    expectedClose: document.querySelector("#expectedClose").value,
    nextFollowUp: document.querySelector("#nextFollowUp").value,
    note: document.querySelector("#customerNote").value.trim()
  };

  try {
    await api("/api/customers", {
      method: "POST",
      body: JSON.stringify(customer)
    });
    els.customerDialog.close();
    showStatus(`${customer.name} 已保存到数据库。`);
    await loadState();
  } catch (error) {
    showStatus(error.message, true);
  }
});

els.activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const activity = {
    customerId: document.querySelector("#activityCustomer").value,
    type: document.querySelector("#activityType").value,
    date: document.querySelector("#activityDate").value,
    owner: document.querySelector("#activityOwner").value.trim(),
    note: document.querySelector("#activityNote").value.trim()
  };

  try {
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
