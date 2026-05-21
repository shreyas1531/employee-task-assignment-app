const API_BASE_URL = resolveApiBaseUrl();
const APP_STATE = {
  session: null,
  workspace: {
    employees: [],
    tasks: [],
    vendors: [],
    products: [],
    clients: [],
    orders: [],
    purchaseOrders: [],
    salesAnalytics: {},
    poAnalytics: {},
    adminMetrics: null,
    activityLogs: [],
    users: [],
    whatsappLogs: [],
    performanceOverview: null
  },
  page: "tasks"
};

const el = {
  loginPanel: document.getElementById("loginPanel"),
  workspaceShell: document.getElementById("workspaceShell"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  logoutBtn: document.getElementById("logoutBtn"),
  sessionLabel: document.getElementById("sessionLabel"),
  navList: document.getElementById("navList"),
  pageTitle: document.getElementById("pageTitle"),
  toastContainer: document.getElementById("toastContainer"),
  pages: {
    tasks: document.getElementById("tasksPage"),
    vendors: document.getElementById("vendorsPage"),
    sales: document.getElementById("salesPage"),
    po: document.getElementById("poPage"),
    admin: document.getElementById("adminPage")
  },
  employeeForm: document.getElementById("employeeForm"),
  employeeName: document.getElementById("employeeName"),
  employeeEmail: document.getElementById("employeeEmail"),
  employeePassword: document.getElementById("employeePassword"),
  employeePhone: document.getElementById("employeePhone"),
  employeeDepartment: document.getElementById("employeeDepartment"),
  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskAssignee: document.getElementById("taskAssignee"),
  taskDescription: document.getElementById("taskDescription"),
  taskDueAt: document.getElementById("taskDueAt"),
  taskUrgency: document.getElementById("taskUrgency"),
  taskReminderMinutes: document.getElementById("taskReminderMinutes"),
  taskPersistentReminders: document.getElementById("taskPersistentReminders"),
  taskSearch: document.getElementById("taskSearch"),
  taskList: document.getElementById("taskList"),
  vendorForm: document.getElementById("vendorForm"),
  vendorName: document.getElementById("vendorName"),
  vendorContactEmail: document.getElementById("vendorContactEmail"),
  vendorContactPhone: document.getElementById("vendorContactPhone"),
  vendorCity: document.getElementById("vendorCity"),
  vendorStatus: document.getElementById("vendorStatus"),
  vendorGoods: document.getElementById("vendorGoods"),
  vendorDefaultCostPrice: document.getElementById("vendorDefaultCostPrice"),
  vendorSearch: document.getElementById("vendorSearch"),
  vendorCards: document.getElementById("vendorCards"),
  productForm: document.getElementById("productForm"),
  productVendorId: document.getElementById("productVendorId"),
  productName: document.getElementById("productName"),
  productItemCode: document.getElementById("productItemCode"),
  productSku: document.getElementById("productSku"),
  productQuantity: document.getElementById("productQuantity"),
  productMinimumStockThreshold: document.getElementById("productMinimumStockThreshold"),
  productUnitPrice: document.getElementById("productUnitPrice"),
  productCategory: document.getElementById("productCategory"),
  productStatus: document.getElementById("productStatus"),
  productDescription: document.getElementById("productDescription"),
  productImageUrl: document.getElementById("productImageUrl"),
  productStockStatus: document.getElementById("productStockStatus"),
  stockMovementForm: document.getElementById("stockMovementForm"),
  stockMovementProductId: document.getElementById("stockMovementProductId"),
  stockMovementType: document.getElementById("stockMovementType"),
  stockMovementQuantity: document.getElementById("stockMovementQuantity"),
  stockMovementNotes: document.getElementById("stockMovementNotes"),
  productSearch: document.getElementById("productSearch"),
  productTable: document.getElementById("productTable"),
  clientForm: document.getElementById("clientForm"),
  clientName: document.getElementById("clientName"),
  clientEmail: document.getElementById("clientEmail"),
  clientPhone: document.getElementById("clientPhone"),
  clientCity: document.getElementById("clientCity"),
  clientStatus: document.getElementById("clientStatus"),
  orderForm: document.getElementById("orderForm"),
  orderId: document.getElementById("orderId"),
  orderClientId: document.getElementById("orderClientId"),
  orderProductId: document.getElementById("orderProductId"),
  orderEmployeeId: document.getElementById("orderEmployeeId"),
  orderQuantity: document.getElementById("orderQuantity"),
  orderDueDate: document.getElementById("orderDueDate"),
  orderStatus: document.getElementById("orderStatus"),
  orderSearch: document.getElementById("orderSearch"),
  orderTable: document.getElementById("orderTable"),
  salesMetricsCards: document.getElementById("salesMetricsCards"),
  purchaseOrderForm: document.getElementById("purchaseOrderForm"),
  poNumber: document.getElementById("poNumber"),
  poVendorId: document.getElementById("poVendorId"),
  poProductName: document.getElementById("poProductName"),
  poItemCode: document.getElementById("poItemCode"),
  poGoods: document.getElementById("poGoods"),
  poQuantity: document.getElementById("poQuantity"),
  poUnitPrice: document.getElementById("poUnitPrice"),
  poTotalAmount: document.getElementById("poTotalAmount"),
  poOrderDate: document.getElementById("poOrderDate"),
  poExpectedDeliveryDate: document.getElementById("poExpectedDeliveryDate"),
  poStatus: document.getElementById("poStatus"),
  poAssignedEmployeeId: document.getElementById("poAssignedEmployeeId"),
  poNotes: document.getElementById("poNotes"),
  poSearch: document.getElementById("poSearch"),
  poTable: document.getElementById("poTable"),
  poDetailPanel: document.getElementById("poDetailPanel"),
  poMetricsCards: document.getElementById("poMetricsCards"),
  managerForm: document.getElementById("managerForm"),
  managerName: document.getElementById("managerName"),
  managerEmail: document.getElementById("managerEmail"),
  managerPhone: document.getElementById("managerPhone"),
  managerPassword: document.getElementById("managerPassword"),
  adminUsersTable: document.getElementById("adminUsersTable"),
  adminMetricsCards: document.getElementById("adminMetricsCards"),
  activityLogsTable: document.getElementById("activityLogsTable"),
  announcementForm: document.getElementById("announcementForm"),
  announcementMessage: document.getElementById("announcementMessage"),
  whatsappTestForm: document.getElementById("whatsappTestForm"),
  whatsappTestEmployeeId: document.getElementById("whatsappTestEmployeeId"),
  whatsappTestMessage: document.getElementById("whatsappTestMessage"),
  processWhatsappQueueBtn: document.getElementById("processWhatsappQueueBtn"),
  whatsappLogsTable: document.getElementById("whatsappLogsTable"),
  performanceWeightsForm: document.getElementById("performanceWeightsForm"),
  weightOnTime: document.getElementById("weightOnTime"),
  weightLate: document.getElementById("weightLate"),
  weightOverdue: document.getElementById("weightOverdue"),
  weightUnfinished: document.getElementById("weightUnfinished"),
  performanceReportForm: document.getElementById("performanceReportForm"),
  performanceReportMonth: document.getElementById("performanceReportMonth"),
  resetPerformanceSnapshotsBtn: document.getElementById("resetPerformanceSnapshotsBtn"),
  performanceOverviewTable: document.getElementById("performanceOverviewTable")
};

bootstrap();

async function bootstrap() {
  bindEvents();
  restoreSession();
  syncAuthUI();
  if (APP_STATE.session) {
    await refreshWorkspace();
    renderAll();
  }
}

function renderWhatsappLogs() {
  if (!isPrivileged()) return;
  const logs = APP_STATE.workspace.whatsappLogs || [];
  if (!logs.length) {
    el.whatsappLogsTable.innerHTML = "<div class='empty'>No WhatsApp logs available.</div>";
    return;
  }
  el.whatsappLogsTable.innerHTML = `
    <table><thead><tr><th>Time</th><th>Employee</th><th>Template</th><th>Status</th></tr></thead><tbody>
      ${logs.slice(0, 50).map((row) => `<tr><td>${formatDateTime(row.createdAt)}</td><td>${escapeHtml(row.employeeName || "-")}</td><td>${escapeHtml(row.templateKey || "-")}</td><td>${escapeHtml(row.status || "-")}</td></tr>`).join("")}
    </tbody></table>
  `;
}

function renderPerformanceOverview() {
  if (!isPrivileged()) return;
  const rankings = APP_STATE.workspace.performanceOverview?.rankings || [];
  if (!rankings.length) {
    el.performanceOverviewTable.innerHTML = "<div class='empty'>No performance data available.</div>";
    return;
  }
  el.performanceOverviewTable.innerHTML = `
    <table><thead><tr><th>Employee</th><th>Score</th><th>Grade</th><th>Completion</th></tr></thead><tbody>
      ${rankings.slice(0, 50).map((row) => `<tr><td>${escapeHtml(row.employeeName || row.employeeId)}</td><td>${row.score}</td><td>${escapeHtml(row.grade || "-")}</td><td>${row.completionPercentage || 0}%</td></tr>`).join("")}
    </tbody></table>
  `;
}

async function onCreateStockMovement(event) {
  event.preventDefault();
  if (!isPrivileged()) return;
  try {
    await api(`/products/${encodeURIComponent(el.stockMovementProductId.value)}/stock-movements`, {
      method: "POST",
      body: {
        movementType: el.stockMovementType.value,
        quantityChange: Number(el.stockMovementQuantity.value || 0),
        notes: el.stockMovementNotes.value
      }
    });
    await refreshWorkspace();
    renderProducts();
    showToast("Stock updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onBroadcastAnnouncement(event) {
  event.preventDefault();
  if (!isPrivileged()) return;
  try {
    await api("/admin/announcements", { method: "POST", body: { message: el.announcementMessage.value } });
    showToast("Announcement queued", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onSendWhatsappTest(event) {
  event.preventDefault();
  if (!isPrivileged()) return;
  try {
    await api("/whatsapp/test-message", { method: "POST", body: { employeeId: el.whatsappTestEmployeeId.value, message: el.whatsappTestMessage.value } });
    showToast("Test message queued", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onProcessWhatsappQueue() {
  if (!isPrivileged()) return;
  try {
    await api("/whatsapp/process", { method: "POST", body: {} });
    await refreshWorkspace();
    showToast("Queue processed", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onSavePerformanceWeights(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  try {
    await api("/admin/performance/weights", {
      method: "POST",
      body: {
        onTimeCompletionWeight: Number(el.weightOnTime.value || 10),
        lateCompletionWeight: Number(el.weightLate.value || 5),
        pendingOverdueWeight: Number(el.weightOverdue.value || -8),
        unfinishedWeight: Number(el.weightUnfinished.value || -10)
      }
    });
    showToast("Performance weights updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onGeneratePerformanceReport(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  try {
    await api("/admin/performance/reports", { method: "POST", body: { month: el.performanceReportMonth.value } });
    showToast("Performance report generated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onResetPerformanceSnapshots() {
  if (!isAdmin()) return;
  try {
    await api("/admin/performance/reset", { method: "POST", body: {} });
    showToast("Performance snapshots reset", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindEvents() {
  el.loginForm.addEventListener("submit", onLogin);
  el.logoutBtn.addEventListener("click", onLogout);
  el.navList.addEventListener("click", onNavClick);
  el.employeeForm.addEventListener("submit", onCreateEmployee);
  el.taskForm.addEventListener("submit", onCreateTask);
  el.taskList.addEventListener("change", onTaskStatusChange);
  el.taskSearch.addEventListener("input", renderTasks);
  el.vendorForm.addEventListener("submit", onCreateVendor);
  el.productForm.addEventListener("submit", onCreateProduct);
  el.stockMovementForm.addEventListener("submit", onCreateStockMovement);
  el.vendorSearch.addEventListener("input", renderVendors);
  el.productSearch.addEventListener("input", renderProducts);
  el.clientForm.addEventListener("submit", onCreateClient);
  el.orderForm.addEventListener("submit", onCreateOrder);
  el.orderTable.addEventListener("change", onOrderStatusChange);
  el.orderSearch.addEventListener("input", renderOrders);
  el.purchaseOrderForm.addEventListener("submit", onCreatePurchaseOrder);
  el.poSearch.addEventListener("input", renderPurchaseOrders);
  el.poTable.addEventListener("change", onPurchaseOrderStatusChange);
  el.poTable.addEventListener("click", onPurchaseOrderClick);
  el.managerForm.addEventListener("submit", onCreateManager);
  el.adminUsersTable.addEventListener("click", onAdminUserAction);
  el.announcementForm.addEventListener("submit", onBroadcastAnnouncement);
  el.whatsappTestForm.addEventListener("submit", onSendWhatsappTest);
  el.processWhatsappQueueBtn.addEventListener("click", onProcessWhatsappQueue);
  el.performanceWeightsForm.addEventListener("submit", onSavePerformanceWeights);
  el.performanceReportForm.addEventListener("submit", onGeneratePerformanceReport);
  el.resetPerformanceSnapshotsBtn.addEventListener("click", onResetPerformanceSnapshots);
}

function resolveApiBaseUrl() {
  return window.location.protocol === "file:" ? "http://localhost:4567/api" : "/api";
}

function persistSession() {
  localStorage.setItem("taskapp_session_v2", JSON.stringify(APP_STATE.session));
}

function restoreSession() {
  try {
    const raw = localStorage.getItem("taskapp_session_v2");
    APP_STATE.session = raw ? JSON.parse(raw) : null;
  } catch (_) {
    APP_STATE.session = null;
  }
}

function clearSession() {
  APP_STATE.session = null;
  persistSession();
}

function currentRole() {
  return APP_STATE.session?.user?.role || null;
}

function isPrivileged() {
  return ["manager", "admin"].includes(currentRole());
}

function isAdmin() {
  return currentRole() === "admin";
}

function syncAuthUI() {
  const loggedIn = Boolean(APP_STATE.session?.token);
  el.loginPanel.classList.toggle("hidden", loggedIn);
  el.workspaceShell.classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    el.sessionLabel.textContent = `${APP_STATE.session.user.name || APP_STATE.session.user.email} (${APP_STATE.session.user.role})`;
  }
}

async function api(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (APP_STATE.session?.token) headers.Authorization = `Bearer ${APP_STATE.session.token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

async function refreshWorkspace() {
  const payload = await api("/workspace");
  APP_STATE.workspace = {
    employees: payload.employees || [],
    tasks: payload.tasks || [],
    vendors: payload.vendors || [],
    products: payload.products || [],
    clients: payload.clients || [],
    orders: payload.orders || [],
    purchaseOrders: payload.purchaseOrders || [],
    salesAnalytics: payload.salesAnalytics || {},
    poAnalytics: payload.poAnalytics || {},
    adminMetrics: payload.adminMetrics || null,
    activityLogs: payload.activityLogs || [],
    users: APP_STATE.workspace.users || [],
    whatsappLogs: APP_STATE.workspace.whatsappLogs || [],
    performanceOverview: APP_STATE.workspace.performanceOverview || null
  };
  if (isAdmin()) {
    const usersPayload = await api("/admin/users");
    APP_STATE.workspace.users = usersPayload.users || [];
  }
  if (isPrivileged()) {
    APP_STATE.workspace.whatsappLogs = (await api("/whatsapp/logs").catch(() => ({ logs: [] }))).logs || [];
    APP_STATE.workspace.performanceOverview = await api("/performance/overview").catch(() => ({ rankings: [] }));
  }
}

function showToast(message, type = "info") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  el.toastContainer.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

async function onLogin(event) {
  event.preventDefault();
  try {
    const payload = await api("/auth/login", {
      method: "POST",
      body: { email: el.loginEmail.value.trim(), password: el.loginPassword.value }
    });
    APP_STATE.session = payload;
    persistSession();
    syncAuthUI();
    await refreshWorkspace();
    renderAll();
    showToast("Logged in successfully", "success");
    el.loginForm.reset();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onLogout() {
  try { await api("/auth/logout", { method: "POST" }); } catch (_) {}
  clearSession();
  syncAuthUI();
}

function onNavClick(event) {
  const btn = event.target.closest("button[data-page]");
  if (!btn) return;
  APP_STATE.page = btn.dataset.page;
  renderPages();
}

function renderPages() {
  const role = currentRole();
  const allowed = role === "admin" ? ["tasks", "vendors", "sales", "po", "admin"] : ["tasks", "vendors", "sales", "po"];
  if (!allowed.includes(APP_STATE.page)) APP_STATE.page = "tasks";
  Object.entries(el.pages).forEach(([name, node]) => {
    node.classList.toggle("active", name === APP_STATE.page);
  });
  [...el.navList.querySelectorAll("button[data-page]")].forEach((button) => {
    button.classList.toggle("active", button.dataset.page === APP_STATE.page);
    button.classList.toggle("hidden", button.dataset.page === "admin" && !isAdmin());
  });
  el.pageTitle.textContent = APP_STATE.page === "sales"
    ? "Sales & Orders"
    : APP_STATE.page === "vendors"
      ? "Vendor Database"
      : APP_STATE.page === "po"
        ? "PO Management"
        : APP_STATE.page === "admin"
          ? "Admin"
          : "Tasks";
}

function renderAll() {
  renderPages();
  renderSelectors();
  renderTasks();
  renderVendors();
  renderProducts();
  renderSalesMetrics();
  renderOrders();
  renderPoMetrics();
  renderPurchaseOrders();
  renderAdminMetrics();
  renderAdminUsers();
  renderActivityLogs();
  renderWhatsappLogs();
  renderPerformanceOverview();
}

function renderSelectors() {
  const employeeOptions = APP_STATE.workspace.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("");
  const vendorOptions = APP_STATE.workspace.vendors.map((vendor) => `<option value="${vendor.id}">${escapeHtml(vendor.name)}</option>`).join("");
  const clientOptions = APP_STATE.workspace.clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("");
  const productOptions = APP_STATE.workspace.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} (${escapeHtml(product.itemCode)})</option>`).join("");
  const employeeOptionsWithBlank = `<option value="">Unassigned</option>${employeeOptions}`;

  el.taskAssignee.innerHTML = employeeOptions || "<option value=\"\">No employees</option>";
  el.orderEmployeeId.innerHTML = employeeOptions || "<option value=\"\">No employees</option>";
  el.productVendorId.innerHTML = vendorOptions || "<option value=\"\">No vendors</option>";
  el.orderClientId.innerHTML = clientOptions || "<option value=\"\">No clients</option>";
  el.orderProductId.innerHTML = productOptions || "<option value=\"\">No products</option>";
  el.poVendorId.innerHTML = vendorOptions || "<option value=\"\">No vendors</option>";
  el.poAssignedEmployeeId.innerHTML = employeeOptionsWithBlank;

  const canManageEmployeesAndTasks = isPrivileged();
  const canManageSalesAndVendors = Boolean(APP_STATE.session?.token);
  setDisabled([el.employeeName, el.employeeEmail, el.employeePassword, el.employeePhone], !canManageEmployeesAndTasks);
  el.employeeForm.querySelector("button").disabled = !canManageEmployeesAndTasks;
  setDisabled([el.taskTitle, el.taskAssignee, el.taskDescription, el.taskDueAt, el.taskUrgency, el.taskReminderMinutes, el.taskPersistentReminders], !canManageEmployeesAndTasks);
  el.taskForm.querySelector("button").disabled = !canManageEmployeesAndTasks;
  setDisabled([el.vendorName, el.vendorContactEmail, el.vendorContactPhone, el.vendorCity, el.vendorStatus, el.vendorGoods, el.vendorDefaultCostPrice], !canManageSalesAndVendors);
  el.vendorForm.querySelector("button").disabled = !canManageSalesAndVendors;
  setDisabled([el.productVendorId, el.productName, el.productItemCode, el.productQuantity, el.productCategory, el.productStockStatus], !canManageSalesAndVendors);
  el.productForm.querySelector("button").disabled = !canManageSalesAndVendors;
  setDisabled([el.clientName, el.clientEmail, el.clientPhone, el.clientCity, el.clientStatus], !canManageSalesAndVendors);
  el.clientForm.querySelector("button").disabled = !canManageSalesAndVendors;
  setDisabled([el.orderId, el.orderClientId, el.orderProductId, el.orderEmployeeId, el.orderQuantity, el.orderDueDate, el.orderStatus], !canManageSalesAndVendors);
  el.orderForm.querySelector("button").disabled = !canManageSalesAndVendors;

  const canManagePo = Boolean(APP_STATE.session?.token);
  setDisabled(
    [el.poNumber, el.poVendorId, el.poProductName, el.poItemCode, el.poGoods, el.poQuantity, el.poUnitPrice, el.poTotalAmount, el.poOrderDate, el.poExpectedDeliveryDate, el.poStatus, el.poAssignedEmployeeId, el.poNotes],
    !canManagePo
  );
  el.purchaseOrderForm.querySelector("button").disabled = !canManagePo;
  if (!isPrivileged()) el.poAssignedEmployeeId.value = APP_STATE.session.user.id;

  el.managerForm.querySelector("button").disabled = !isAdmin();
}

function setDisabled(nodes, disabled) {
  nodes.forEach((node) => { if (node) node.disabled = disabled; });
}

function renderTasks() {
  const q = el.taskSearch.value.trim().toLowerCase();
  const rows = APP_STATE.workspace.tasks.filter((task) => `${task.title} ${task.description} ${task.status}`.toLowerCase().includes(q));
  if (!rows.length) {
    el.taskList.innerHTML = "<div class='empty'>No tasks found.</div>";
    return;
  }
  el.taskList.innerHTML = `
    <table><thead><tr><th>Title</th><th>Assignee</th><th>Due</th><th>Status</th><th>Urgency</th></tr></thead><tbody>
      ${rows.map((task) => {
        const assignee = APP_STATE.workspace.employees.find((employee) => employee.id === task.assigneeId);
        const canEdit = isPrivileged() || APP_STATE.session.user.id === task.assigneeId;
        return `
          <tr>
            <td>${escapeHtml(task.title)}</td>
            <td>${escapeHtml(assignee ? assignee.name : "-")}</td>
            <td>${formatDateTime(task.dueAt)}</td>
            <td><select data-task-id="${task.id}" ${canEdit ? "" : "disabled"}>
              ${["Pending", "In Progress", "Completed"].map((status) => `<option ${task.status === status ? "selected" : ""}>${status}</option>`).join("")}
            </select></td>
            <td><span class="pill ${task.urgency.toLowerCase()}">${escapeHtml(task.urgency)}</span></td>
          </tr>
        `;
      }).join("")}
    </tbody></table>
  `;
}

function renderVendors() {
  const q = el.vendorSearch.value.trim().toLowerCase();
  const rows = APP_STATE.workspace.vendors.filter((vendor) => `${vendor.name} ${vendor.city} ${vendor.status}`.toLowerCase().includes(q));
  el.vendorCards.innerHTML = rows.length ? rows.map((vendor) => `
    <article class="mini-card">
      <h4>${escapeHtml(vendor.name)}</h4>
      <p>${escapeHtml(vendor.city || "-")} • ${escapeHtml(vendor.status || "Active")}</p>
      <p>${escapeHtml(vendor.contactEmail || "-")} • ${escapeHtml(vendor.contactPhone || "-")}</p>
      <p>Products supplied: <strong>${Number(vendor.productsSupplied || 0)}</strong></p>
    </article>
  `).join("") : "<div class='empty'>No vendors found.</div>";
}

function renderProducts() {
  const q = el.productSearch.value.trim().toLowerCase();
  const rows = APP_STATE.workspace.products.filter((product) => `${product.name} ${product.itemCode} ${product.category}`.toLowerCase().includes(q));
  el.productTable.innerHTML = rows.length ? `
    <table><thead><tr><th>Name</th><th>Item Code</th><th>Vendor</th><th>Quantity</th><th>Category</th><th>Stock</th></tr></thead><tbody>
      ${rows.map((product) => `
        <tr>
          <td>${escapeHtml(product.name)}</td>
          <td>${escapeHtml(product.itemCode)}</td>
          <td>${escapeHtml(product.vendorName)}</td>
          <td>${product.quantity}</td>
          <td>${escapeHtml(product.category)}</td>
          <td>${escapeHtml(product.stockStatus)}</td>
        </tr>
      `).join("")}
    </tbody></table>
  ` : "<div class='empty'>No products found.</div>";
}

function renderSalesMetrics() {
  const analytics = APP_STATE.workspace.salesAnalytics || {};
  const cards = [
    { label: "Total Orders", value: analytics.totalOrders || 0 },
    { label: "Pending Orders", value: analytics.pendingOrders || 0 },
    { label: "Delivered Orders", value: analytics.deliveredOrders || 0 },
    { label: "Revenue Summary", value: formatCurrency(analytics.revenueSummary || 0) }
  ];
  el.salesMetricsCards.innerHTML = cards.map((card) => `<article class="mini-card"><p>${card.label}</p><h4>${card.value}</h4></article>`).join("");
}

function renderOrders() {
  const q = el.orderSearch.value.trim().toLowerCase();
  const rows = APP_STATE.workspace.orders.filter((order) => `${order.orderId} ${order.clientName} ${order.itemCode}`.toLowerCase().includes(q));
  if (!rows.length) {
    el.orderTable.innerHTML = "<div class='empty'>No orders found.</div>";
    return;
  }
  el.orderTable.innerHTML = `
    <table><thead><tr><th>Order</th><th>Client</th><th>Product</th><th>Item Code</th><th>Qty</th><th>Due</th><th>Status</th><th>Assigned</th></tr></thead><tbody>
      ${rows.map((order) => {
        const canEdit = isPrivileged() || APP_STATE.session.user.id === order.assignedEmployeeId;
        const dueClass = order.isOverdue ? "overdue" : order.isDueSoon ? "due-soon" : "";
        return `
          <tr>
            <td>${escapeHtml(order.orderId)}</td>
            <td>${escapeHtml(order.clientName)}</td>
            <td>${escapeHtml(order.productName)}</td>
            <td>${escapeHtml(order.itemCode)}</td>
            <td>${order.quantity}</td>
            <td><span class="${dueClass}">${formatDateTime(order.dueDate)}</span></td>
            <td><select data-order-id="${order.id}" ${canEdit ? "" : "disabled"}>
              ${["Pending", "Processing", "Delivered", "Cancelled"].map((status) => `<option ${order.deliveryStatus === status ? "selected" : ""}>${status}</option>`).join("")}
            </select></td>
            <td>${escapeHtml(order.assignedEmployeeName)}</td>
          </tr>
        `;
      }).join("")}
    </tbody></table>
  `;
}

function renderPoMetrics() {
  const analytics = APP_STATE.workspace.poAnalytics || {};
  const cards = [
    { label: "Total POs", value: analytics.totalPurchaseOrders || 0 },
    { label: "Pending POs", value: analytics.pendingPurchaseOrders || 0 },
    { label: "Delivered POs", value: analytics.deliveredPurchaseOrders || 0 },
    { label: "Overdue POs", value: analytics.overduePurchaseOrders || 0 },
    { label: "PO Value", value: formatCurrency(analytics.purchaseOrderValue || 0) }
  ];
  el.poMetricsCards.innerHTML = cards.map((card) => `<article class="mini-card"><p>${card.label}</p><h4>${card.value}</h4></article>`).join("");
}

function renderPurchaseOrders() {
  const q = el.poSearch.value.trim().toLowerCase();
  const rows = APP_STATE.workspace.purchaseOrders.filter((po) => `${po.poNumber} ${po.productName} ${po.itemCode} ${po.goods}`.toLowerCase().includes(q));
  if (!rows.length) {
    el.poTable.innerHTML = "<div class='empty'>No purchase orders found.</div>";
    return;
  }
  el.poTable.innerHTML = `
    <table><thead><tr><th>PO</th><th>Product</th><th>Item</th><th>Qty</th><th>Total</th><th>Expected</th><th>Status</th><th>Assigned</th></tr></thead><tbody>
      ${rows.map((po) => {
        const canEdit = isPrivileged() || APP_STATE.session.user.id === po.assignedEmployeeId;
        const dueClass = po.isOverdue ? "overdue" : po.isDueSoon ? "due-soon" : "";
        return `
          <tr data-po-row-id="${po.id}">
            <td><button data-po-view-id="${po.id}" class="mini">${escapeHtml(po.poNumber)}</button></td>
            <td>${escapeHtml(po.productName)}</td>
            <td>${escapeHtml(po.itemCode)}</td>
            <td>${Number(po.quantity || 0)}</td>
            <td>${formatCurrency(po.totalAmount || 0)}</td>
            <td><span class="${dueClass}">${formatDateTime(po.expectedDeliveryDate)}</span></td>
            <td><select data-po-id="${po.id}" ${canEdit ? "" : "disabled"}>
              ${["Draft", "Approved", "Ordered", "In Transit", "Delivered", "Cancelled"].map((status) => `<option ${po.status === status ? "selected" : ""}>${status}</option>`).join("")}
            </select></td>
            <td>${escapeHtml(po.assignedEmployeeName || "-")}</td>
          </tr>
        `;
      }).join("")}
    </tbody></table>
  `;
}

function renderAdminMetrics() {
  if (!isAdmin() || !APP_STATE.workspace.adminMetrics) {
    el.adminMetricsCards.innerHTML = "<div class='empty'>Admin metrics are visible to admin users only.</div>";
    return;
  }
  const m = APP_STATE.workspace.adminMetrics;
  const cards = [
    { label: "Employees", value: m.employeeCount || 0 },
    { label: "Tasks", value: m.taskCount || 0 },
    { label: "Pending Tasks", value: m.pendingTaskCount || 0 },
    { label: "Pending Orders", value: m.pendingOrderCount || 0 },
    { label: "Vendors", value: m.vendorCount || 0 },
    { label: "Clients", value: m.clientCount || 0 },
    { label: "Products", value: m.productCount || 0 }
  ];
  el.adminMetricsCards.innerHTML = cards.map((card) => `<article class="mini-card"><p>${card.label}</p><h4>${card.value}</h4></article>`).join("");
}

function renderAdminUsers() {
  if (!isAdmin()) {
    el.adminUsersTable.innerHTML = "<div class='empty'>Admin access required.</div>";
    return;
  }
  if (!APP_STATE.workspace.users.length) {
    el.adminUsersTable.innerHTML = "<div class='empty'>No accounts found.</div>";
    return;
  }
  el.adminUsersTable.innerHTML = `
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${APP_STATE.workspace.users.map((user) => `
        <tr>
          <td>${escapeHtml(user.name || "-")}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.role)}</td>
          <td>${user.isActive ? "Active" : "Disabled"}</td>
          <td>
            <button data-action="reset-password" data-user-id="${user.id}" class="mini">Reset Password</button>
            <button data-action="toggle-status" data-user-id="${user.id}" data-active="${user.isActive ? "1" : "0"}" class="mini">${user.isActive ? "Disable" : "Enable"}</button>
          </td>
        </tr>
      `).join("")}
    </tbody></table>
  `;
}

function renderActivityLogs() {
  if (!isAdmin()) {
    el.activityLogsTable.innerHTML = "<div class='empty'>Admin access required.</div>";
    return;
  }
  const rows = APP_STATE.workspace.activityLogs || [];
  if (!rows.length) {
    el.activityLogsTable.innerHTML = "<div class='empty'>No activity logs found.</div>";
    return;
  }
  el.activityLogsTable.innerHTML = `
    <table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead><tbody>
      ${rows.map((row) => `
        <tr>
          <td>${formatDateTime(row.createdAt)}</td>
          <td>${escapeHtml(row.actorName || row.actorRole || "-")}</td>
          <td>${escapeHtml(row.action)}</td>
          <td>${escapeHtml(`${row.entityType || "-"} ${row.entityId || ""}`.trim())}</td>
        </tr>
      `).join("")}
    </tbody></table>
  `;
}

async function onCreateEmployee(event) {
  event.preventDefault();
  if (!isPrivileged()) return;
  try {
    await api("/employees", { method: "POST", body: { name: el.employeeName.value, email: el.employeeEmail.value, password: el.employeePassword.value, phoneNumber: el.employeePhone.value, department: el.employeeDepartment.value } });
    await refreshWorkspace();
    renderAll();
    el.employeeForm.reset();
    showToast("Employee created", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreateTask(event) {
  event.preventDefault();
  if (!isPrivileged()) return;
  try {
    await api("/tasks", {
      method: "POST",
      body: {
        title: el.taskTitle.value,
        description: el.taskDescription.value,
        assigneeId: el.taskAssignee.value,
        dueAt: new Date(el.taskDueAt.value).toISOString(),
        urgency: el.taskUrgency.value,
        reminderEveryMinutes: Number(el.taskReminderMinutes.value || 60),
        persistentReminders: Boolean(el.taskPersistentReminders.checked),
        attachments: []
      }
    });
    await refreshWorkspace();
    renderTasks();
    el.taskForm.reset();
    showToast("Task created", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onTaskStatusChange(event) {
  const select = event.target.closest("select[data-task-id]");
  if (!select) return;
  try {
    await api(`/tasks/${encodeURIComponent(select.dataset.taskId)}/status`, { method: "PUT", body: { status: select.value } });
    await refreshWorkspace();
    renderTasks();
    showToast("Task status updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreateVendor(event) {
  event.preventDefault();
  if (!APP_STATE.session?.token) return;
  try {
    await api("/vendors", {
      method: "POST",
      body: {
        name: el.vendorName.value,
        contactEmail: el.vendorContactEmail.value,
        contactPhone: el.vendorContactPhone.value,
        city: el.vendorCity.value,
        status: el.vendorStatus.value,
        goods: el.vendorGoods.value.split(",").map((item) => item.trim()).filter(Boolean),
        defaultCostPrice: Number(el.vendorDefaultCostPrice.value || 0)
      }
    });
    await refreshWorkspace();
    renderAll();
    el.vendorForm.reset();
    showToast("Vendor saved", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreateProduct(event) {
  event.preventDefault();
  if (!APP_STATE.session?.token) return;
  try {
    await api("/products", {
      method: "POST",
      body: {
        vendorId: el.productVendorId.value,
        name: el.productName.value,
        itemCode: el.productItemCode.value,
        sku: el.productSku.value,
        quantity: Number(el.productQuantity.value || 0),
        minimumStockThreshold: Number(el.productMinimumStockThreshold.value || 0),
        unitPrice: Number(el.productUnitPrice.value || 0),
        category: el.productCategory.value,
        status: el.productStatus.value,
        description: el.productDescription.value,
        imageUrl: el.productImageUrl.value,
        stockStatus: el.productStockStatus.value
      }
    });
    await refreshWorkspace();
    renderAll();
    el.productForm.reset();
    showToast("Product saved", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreateClient(event) {
  event.preventDefault();
  if (!APP_STATE.session?.token) return;
  try {
    await api("/clients", {
      method: "POST",
      body: {
        name: el.clientName.value,
        contactEmail: el.clientEmail.value,
        contactPhone: el.clientPhone.value,
        city: el.clientCity.value,
        status: el.clientStatus.value
      }
    });
    await refreshWorkspace();
    renderAll();
    el.clientForm.reset();
    showToast("Client saved", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreateOrder(event) {
  event.preventDefault();
  if (!APP_STATE.session?.token) return;
  try {
    await api("/orders", {
      method: "POST",
      body: {
        orderId: el.orderId.value,
        clientId: el.orderClientId.value,
        productId: el.orderProductId.value,
        quantity: Number(el.orderQuantity.value || 1),
        dueDate: new Date(el.orderDueDate.value).toISOString(),
        deliveryStatus: el.orderStatus.value,
        assignedEmployeeId: el.orderEmployeeId.value
      }
    });
    await refreshWorkspace();
    renderOrders();
    renderSalesMetrics();
    el.orderForm.reset();
    showToast("Order saved", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onOrderStatusChange(event) {
  const select = event.target.closest("select[data-order-id]");
  if (!select) return;
  try {
    await api(`/orders/${encodeURIComponent(select.dataset.orderId)}/status`, { method: "PUT", body: { deliveryStatus: select.value } });
    await refreshWorkspace();
    renderOrders();
    renderSalesMetrics();
    showToast("Order status updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreatePurchaseOrder(event) {
  event.preventDefault();
  try {
    await api("/purchase-orders", {
      method: "POST",
      body: {
        poNumber: el.poNumber.value,
        vendorId: el.poVendorId.value,
        productName: el.poProductName.value,
        itemCode: el.poItemCode.value,
        goods: el.poGoods.value,
        quantity: Number(el.poQuantity.value || 1),
        unitPrice: Number(el.poUnitPrice.value || 0),
        totalAmount: Number(el.poTotalAmount.value || 0),
        orderDate: new Date(el.poOrderDate.value).toISOString(),
        expectedDeliveryDate: new Date(el.poExpectedDeliveryDate.value).toISOString(),
        status: el.poStatus.value,
        assignedEmployeeId: el.poAssignedEmployeeId.value,
        notes: el.poNotes.value
      }
    });
    await refreshWorkspace();
    renderPoMetrics();
    renderPurchaseOrders();
    el.purchaseOrderForm.reset();
    showToast("Purchase order saved", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onPurchaseOrderStatusChange(event) {
  const select = event.target.closest("select[data-po-id]");
  if (!select) return;
  try {
    await api(`/purchase-orders/${encodeURIComponent(select.dataset.poId)}/status`, { method: "PUT", body: { status: select.value } });
    await refreshWorkspace();
    renderPoMetrics();
    renderPurchaseOrders();
    showToast("PO status updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onPurchaseOrderClick(event) {
  const button = event.target.closest("button[data-po-view-id]");
  if (!button) return;
  try {
    const payload = await api(`/purchase-orders/${encodeURIComponent(button.dataset.poViewId)}`);
    const po = payload.purchaseOrder;
    const related = payload.relatedSalesOrders || [];
    const timeline = payload.timeline || [];
    el.poDetailPanel.innerHTML = `
      <div class="stack">
        <p><strong>PO:</strong> ${escapeHtml(po.poNumber)}</p>
        <p><strong>Status:</strong> ${escapeHtml(po.status)}</p>
        <p><strong>Vendor:</strong> ${escapeHtml(String(po.vendorId || "-"))}</p>
        <p><strong>Product:</strong> ${escapeHtml(po.productName)}</p>
        <p><strong>Item Code:</strong> ${escapeHtml(po.itemCode)}</p>
        <p><strong>Expected Delivery:</strong> ${formatDateTime(po.expectedDeliveryDate)}</p>
        <p><strong>Notes:</strong> ${escapeHtml(po.notes || "-")}</p>
      </div>
      <h4>Linked Sales Orders</h4>
      ${related.length ? `<ul>${related.map((order) => `<li>${escapeHtml(order.orderId)} • ${escapeHtml(order.clientName)} • ${escapeHtml(order.deliveryStatus)}</li>`).join("")}</ul>` : "<div class='empty'>No related orders.</div>"}
      <h4>Timeline</h4>
      ${timeline.length ? `<ul>${timeline.map((item) => `<li>${formatDateTime(item.createdAt)} • ${escapeHtml(item.actorName || item.actorRole || "-")} • ${escapeHtml(item.action)}</li>`).join("")}</ul>` : "<div class='empty'>No timeline entries.</div>"}
    `;
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onCreateManager(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  try {
    const payload = await api("/admin/managers", {
      method: "POST",
      body: { name: el.managerName.value, email: el.managerEmail.value, phone: el.managerPhone.value, password: el.managerPassword.value }
    });
    await refreshWorkspace();
    renderAdminUsers();
    el.managerForm.reset();
    showToast(`Manager created. Password: ${payload.credentials.password}`, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onAdminUserAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !isAdmin()) return;
  const userId = button.dataset.userId;
  try {
    if (button.dataset.action === "reset-password") {
      const payload = await api(`/admin/users/${encodeURIComponent(userId)}/reset-password`, { method: "POST", body: {} });
      showToast(`New password: ${payload.credentials.password}`, "success");
    } else {
      const active = button.dataset.active !== "1";
      await api(`/admin/users/${encodeURIComponent(userId)}/account-status`, { method: "POST", body: { isActive: active } });
      showToast("Account status updated", "success");
    }
    await refreshWorkspace();
    renderAdminUsers();
    renderAdminMetrics();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "₹0.00";
  return `₹${number.toFixed(2)}`;
}