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
    users: []
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
    admin: document.getElementById("adminPage")
  },
  employeeForm: document.getElementById("employeeForm"),
  employeeName: document.getElementById("employeeName"),
  employeeEmail: document.getElementById("employeeEmail"),
  employeePassword: document.getElementById("employeePassword"),
  employeePhone: document.getElementById("employeePhone"),
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
  productQuantity: document.getElementById("productQuantity"),
  productCategory: document.getElementById("productCategory"),
  productStockStatus: document.getElementById("productStockStatus"),
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
  managerForm: document.getElementById("managerForm"),
  managerName: document.getElementById("managerName"),
  managerEmail: document.getElementById("managerEmail"),
  managerPhone: document.getElementById("managerPhone"),
  managerPassword: document.getElementById("managerPassword"),
  adminUsersTable: document.getElementById("adminUsersTable")
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
  el.vendorSearch.addEventListener("input", renderVendors);
  el.productSearch.addEventListener("input", renderProducts);
  el.clientForm.addEventListener("submit", onCreateClient);
  el.orderForm.addEventListener("submit", onCreateOrder);
  el.orderTable.addEventListener("change", onOrderStatusChange);
  el.orderSearch.addEventListener("input", renderOrders);
  el.managerForm.addEventListener("submit", onCreateManager);
  el.adminUsersTable.addEventListener("click", onAdminUserAction);
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
    users: APP_STATE.workspace.users || []
  };
  if (isAdmin()) {
    const usersPayload = await api("/admin/users");
    APP_STATE.workspace.users = usersPayload.users || [];
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
  const allowed = role === "admin" ? ["tasks", "vendors", "sales", "admin"] : ["tasks", "vendors", "sales"];
  if (!allowed.includes(APP_STATE.page)) APP_STATE.page = "tasks";

  Object.entries(el.pages).forEach(([name, node]) => {
    node.classList.toggle("active", name === APP_STATE.page);
  });
  [...el.navList.querySelectorAll("button[data-page]")].forEach((button) => {
    button.classList.toggle("active", button.dataset.page === APP_STATE.page);
    button.classList.toggle("hidden", button.dataset.page === "admin" && !isAdmin());
  });
  el.pageTitle.textContent = APP_STATE.page === "sales" ? "Sales & Orders" : APP_STATE.page === "vendors" ? "Vendor Database" : APP_STATE.page === "admin" ? "Admin" : "Tasks";
}

function renderAll() {
  renderPages();
  renderSelectors();
  renderTasks();
  renderVendors();
  renderProducts();
  renderOrders();
  renderAdminUsers();
}

function renderSelectors() {
  const employeeOptions = APP_STATE.workspace.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("");
  const vendorOptions = APP_STATE.workspace.vendors.map((vendor) => `<option value="${vendor.id}">${escapeHtml(vendor.name)}</option>`).join("");
  const clientOptions = APP_STATE.workspace.clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("");
  const productOptions = APP_STATE.workspace.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} (${escapeHtml(product.itemCode)})</option>`).join("");
  el.taskAssignee.innerHTML = employeeOptions || "<option value=\"\">No employees</option>";
  el.orderEmployeeId.innerHTML = employeeOptions || "<option value=\"\">No employees</option>";
  el.productVendorId.innerHTML = vendorOptions || "<option value=\"\">No vendors</option>";
  el.orderClientId.innerHTML = clientOptions || "<option value=\"\">No clients</option>";
  el.orderProductId.innerHTML = productOptions || "<option value=\"\">No products</option>";

  const canManage = isPrivileged();
  setDisabled([el.employeeName, el.employeeEmail, el.employeePassword, el.employeePhone], !canManage);
  el.employeeForm.querySelector("button").disabled = !canManage;
  setDisabled([el.taskTitle, el.taskAssignee, el.taskDescription, el.taskDueAt, el.taskUrgency, el.taskReminderMinutes, el.taskPersistentReminders], !canManage);
  el.taskForm.querySelector("button").disabled = !canManage;
  setDisabled([el.vendorName, el.vendorContactEmail, el.vendorContactPhone, el.vendorCity, el.vendorStatus, el.vendorGoods, el.vendorDefaultCostPrice], !canManage);
  el.vendorForm.querySelector("button").disabled = !canManage;
  setDisabled([el.productVendorId, el.productName, el.productItemCode, el.productQuantity, el.productCategory, el.productStockStatus], !canManage);
  el.productForm.querySelector("button").disabled = !canManage;
  setDisabled([el.clientName, el.clientEmail, el.clientPhone, el.clientCity, el.clientStatus], !canManage);
  el.clientForm.querySelector("button").disabled = !canManage;
  setDisabled([el.orderId, el.orderClientId, el.orderProductId, el.orderEmployeeId, el.orderQuantity, el.orderDueDate, el.orderStatus], !canManage);
  el.orderForm.querySelector("button").disabled = !canManage;
  el.managerForm.querySelector("button").disabled = !isAdmin();
}

function setDisabled(nodes, disabled) {
  nodes.forEach((node) => { node.disabled = disabled; });
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

async function onCreateEmployee(event) {
  event.preventDefault();
  if (!isPrivileged()) return;
  try {
    await api("/employees", { method: "POST", body: { name: el.employeeName.value, email: el.employeeEmail.value, password: el.employeePassword.value, phone: el.employeePhone.value } });
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
  if (!isPrivileged()) return;
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
  if (!isPrivileged()) return;
  try {
    await api("/products", {
      method: "POST",
      body: {
        vendorId: el.productVendorId.value,
        name: el.productName.value,
        itemCode: el.productItemCode.value,
        quantity: Number(el.productQuantity.value || 0),
        category: el.productCategory.value,
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
  if (!isPrivileged()) return;
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
  if (!isPrivileged()) return;
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
    showToast("Order status updated", "success");
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