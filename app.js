const STORAGE_KEY = "employee_task_assignment_v1";
const API_BASE_URL = resolveApiBaseUrl();
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 1 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function resolveApiBaseUrl() {
  const configured = typeof window.TASK_APP_API_BASE_URL === "string"
    ? window.TASK_APP_API_BASE_URL.trim()
    : "";
  if (configured.length > 0) {
    return configured.replace(/\/$/, "");
  }
  if (window.location.protocol === "file:") {
    return "http://localhost:4567/api";
  }
  return "/api";
}

const URGENCY_WEIGHT = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_STATE = {
  session: null,
  employees: [],
  tasks: [],
  notifications: [],
  messages: [],
  vendors: [],
  purchaseOrders: [],
  vendorAlerts: [],
  settings: {
    activeRole: "manager",
    selectedEmployeeId: null,
    managerMessageEmployeeId: null,
    calendarMonthOffset: 0,
    calendarSelectedDate: null,
    autoOpenWhatsApp: false
  }
};

const elements = {
  loginPanel: document.getElementById("loginPanel"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  workspaceShell: document.getElementById("workspaceShell"),
  sessionInfo: document.getElementById("sessionInfo"),
  sessionLabel: document.getElementById("sessionLabel"),
  logoutBtn: document.getElementById("logoutBtn"),

  managerViewBtn: document.getElementById("managerViewBtn"),
  employeeViewBtn: document.getElementById("employeeViewBtn"),
  vendorViewBtn: document.getElementById("vendorViewBtn"),
  managerPanel: document.getElementById("managerPanel"),
  employeePanel: document.getElementById("employeePanel"),
  vendorPanel: document.getElementById("vendorPanel"),

  employeeForm: document.getElementById("employeeForm"),
  employeeName: document.getElementById("employeeName"),
  employeeEmail: document.getElementById("employeeEmail"),
  employeePassword: document.getElementById("employeePassword"),
  employeePhone: document.getElementById("employeePhone"),
  employeeList: document.getElementById("employeeList"),

  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskDescription: document.getElementById("taskDescription"),
  taskAssignee: document.getElementById("taskAssignee"),
  taskDueAt: document.getElementById("taskDueAt"),
  taskUrgency: document.getElementById("taskUrgency"),
  taskReminderMinutes: document.getElementById("taskReminderMinutes"),
  taskPersistentReminders: document.getElementById("taskPersistentReminders"),
  requestNotificationPermission: document.getElementById("requestNotificationPermission"),
  attachmentDropzone: document.getElementById("attachmentDropzone"),
  taskAttachmentInput: document.getElementById("taskAttachmentInput"),
  draftAttachmentList: document.getElementById("draftAttachmentList"),
  autoOpenWhatsApp: document.getElementById("autoOpenWhatsApp"),

  managerTaskList: document.getElementById("managerTaskList"),
  urgencySummary: document.getElementById("urgencySummary"),
  employeeAnalyticsList: document.getElementById("employeeAnalyticsList"),

  managerMessageForm: document.getElementById("managerMessageForm"),
  managerMessageEmployeeSelect: document.getElementById("managerMessageEmployeeSelect"),
  managerMessageTaskSelect: document.getElementById("managerMessageTaskSelect"),
  managerMessageInput: document.getElementById("managerMessageInput"),
  managerConversation: document.getElementById("managerConversation"),

  employeeSelectDashboard: document.getElementById("employeeSelectDashboard"),
  employeeTaskList: document.getElementById("employeeTaskList"),
  employeeNotifications: document.getElementById("employeeNotifications"),
  employeeMessageForm: document.getElementById("employeeMessageForm"),
  employeeMessageTaskSelect: document.getElementById("employeeMessageTaskSelect"),
  employeeMessageInput: document.getElementById("employeeMessageInput"),
  employeeConversation: document.getElementById("employeeConversation"),

  calendarPrevBtn: document.getElementById("calendarPrevBtn"),
  calendarNextBtn: document.getElementById("calendarNextBtn"),
  calendarMonthLabel: document.getElementById("calendarMonthLabel"),
  calendarGrid: document.getElementById("calendarGrid"),
  calendarDayDetails: document.getElementById("calendarDayDetails"),

  vendorForm: document.getElementById("vendorForm"),
  vendorName: document.getElementById("vendorName"),
  vendorContactEmail: document.getElementById("vendorContactEmail"),
  vendorGoods: document.getElementById("vendorGoods"),
  vendorDefaultCostPrice: document.getElementById("vendorDefaultCostPrice"),
  vendorList: document.getElementById("vendorList"),

  poForm: document.getElementById("poForm"),
  poVendorSelect: document.getElementById("poVendorSelect"),
  poNumber: document.getElementById("poNumber"),
  poGoods: document.getElementById("poGoods"),
  poQuantity: document.getElementById("poQuantity"),
  poCostPrice: document.getElementById("poCostPrice"),
  poRaisedAt: document.getElementById("poRaisedAt"),
  poExpectedAt: document.getElementById("poExpectedAt"),
  poStatus: document.getElementById("poStatus"),
  poList: document.getElementById("poList"),

  vendorAlertForm: document.getElementById("vendorAlertForm"),
  vendorAlertVendorSelect: document.getElementById("vendorAlertVendorSelect"),
  vendorAlertPoSelect: document.getElementById("vendorAlertPoSelect"),
  vendorAlertPriority: document.getElementById("vendorAlertPriority"),
  vendorAlertMessage: document.getElementById("vendorAlertMessage"),
  vendorAlertList: document.getElementById("vendorAlertList")
};

let state = loadState();
let draftAttachments = [];

bootstrap();
async function bootstrap() {
  normalizeLoadedState();
  bindEvents();
  setDefaultDueDate();
  setDefaultPoRaisedDate();
  await hydrateSessionFromApi();
  await runReminderSweep();
  startReminderEngine();
  render();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  elements.logoutBtn.addEventListener("click", async () => {
    await handleLogout();
  });

  elements.managerViewBtn.addEventListener("click", () => switchRole("manager"));
  elements.employeeViewBtn.addEventListener("click", () => switchRole("employee"));
  elements.vendorViewBtn.addEventListener("click", () => switchRole("vendor"));

  elements.employeeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addEmployee();
  });

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await assignTask();
  });

  elements.taskAttachmentInput.addEventListener("change", async (event) => {
    await addDraftAttachmentsFromFiles(event.target.files);
    event.target.value = "";
  });

  elements.attachmentDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.attachmentDropzone.classList.add("dragover");
  });

  elements.attachmentDropzone.addEventListener("dragleave", () => {
    elements.attachmentDropzone.classList.remove("dragover");
  });

  elements.attachmentDropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    elements.attachmentDropzone.classList.remove("dragover");
    await addDraftAttachmentsFromFiles(event.dataTransfer.files);
  });

  elements.draftAttachmentList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("button[data-action='remove-draft-attachment']");
    if (!removeButton) {
      return;
    }
    removeDraftAttachment(removeButton.dataset.attachmentId);
  });

  elements.requestNotificationPermission.addEventListener("click", requestBrowserNotificationPermission);

  elements.autoOpenWhatsApp.addEventListener("change", (event) => {
    state.settings.autoOpenWhatsApp = Boolean(event.target.checked);
    saveState();
  });

  elements.employeeSelectDashboard.addEventListener("change", (event) => {
    state.settings.selectedEmployeeId = event.target.value || null;
    saveState();
    renderEmployeeView();
  });

  elements.managerMessageEmployeeSelect.addEventListener("change", (event) => {
    state.settings.managerMessageEmployeeId = event.target.value || null;
    saveState();
    renderManagerMessaging();
  });

  elements.managerMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendInternalMessage("manager");
  });

  elements.employeeMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendInternalMessage("employee");
  });

  elements.managerTaskList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const taskId = button.dataset.taskId;
    const action = button.dataset.action;

    if (action === "manager-complete") {
      await completeTask(taskId, "manager");
    }

    if (action === "manager-whatsapp") {
      openWhatsApp(taskId, "Manager requested update on assigned task.");
    }

    if (action === "manager-reminder") {
      if (!isManagerSession()) {
        return;
      }
      await sendReminderNow(taskId, "manual");
    }
  });

  elements.employeeTaskList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const taskId = button.dataset.taskId;
    const action = button.dataset.action;

    if (action === "employee-complete") {
      await completeTask(taskId, "employee");
    }

    if (action === "employee-whatsapp") {
      openWhatsApp(taskId, "Employee task acknowledgement and progress update.");
    }
  });

  elements.calendarPrevBtn.addEventListener("click", () => {
    state.settings.calendarMonthOffset -= 1;
    saveState();
    renderCalendar();
  });

  elements.calendarNextBtn.addEventListener("click", () => {
    state.settings.calendarMonthOffset += 1;
    saveState();
    renderCalendar();
  });

  elements.calendarGrid.addEventListener("click", (event) => {
    const cell = event.target.closest(".day-cell");
    if (!cell || !cell.dataset.date) {
      return;
    }
    state.settings.calendarSelectedDate = cell.dataset.date;
    saveState();
    renderCalendar();
  });

  elements.vendorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addVendor();
  });

  elements.poForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addPurchaseOrder();
  });

  elements.poVendorSelect.addEventListener("change", () => {
    prefillPoCostPriceFromVendor(false);
  });

  elements.vendorAlertVendorSelect.addEventListener("change", () => {
    renderVendorAlertPoOptions();
  });

  elements.vendorAlertForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendVendorAlert();
  });
}

async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const body = options.body;
  const requiresAuth = Boolean(options.requiresAuth);
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (requiresAuth && state.session && state.session.token) {
    headers.Authorization = `Bearer ${state.session.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const rawResponse = await response.text();
  let payload = {};
  if (rawResponse) {
    try {
      payload = JSON.parse(rawResponse);
    } catch (error) {
      payload = {};
    }
  }

  if (!response.ok) {
    if (requiresAuth && response.status === 401) {
      clearSessionState();
      saveState();
      render();
    }
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }

  return payload;
}

function normalizeEmployeeRecord(employee, index) {
  return {
    id: String(employee.id || generateId()),
    name: String(employee.name || `Employee ${index + 1}`),
    phone: normalizePhone(employee.phone),
    email: normalizeEmail(
      employee.email || `${slugify(employee.name || "employee")}.${index + 1}@taskapp.local`
    ),
    createdAt: employee.createdAt || new Date().toISOString(),
    updatedAt: employee.updatedAt || employee.createdAt || new Date().toISOString()
  };
}

function upsertEmployeeRecord(employeePayload) {
  const normalized = normalizeEmployeeRecord(employeePayload, state.employees.length);
  const existingIndex = state.employees.findIndex((employee) => employee.id === normalized.id);
  if (existingIndex >= 0) {
    state.employees[existingIndex] = normalized;
  } else {
    state.employees.push(normalized);
  }
  return normalized;
}

function clearSessionState() {
  state.session = null;
}
function normalizeTaskRecord(task, index) {
  const dueAt = new Date(task.dueAt);
  const createdAt = new Date(task.createdAt);
  const updatedAt = new Date(task.updatedAt);
  const completedAt = task.completedAt ? new Date(task.completedAt) : null;
  const nextReminderAt = task.nextReminderAt ? new Date(task.nextReminderAt) : null;
  const lastReminderAt = task.lastReminderAt ? new Date(task.lastReminderAt) : null;

  return {
    id: String(task.id || generateId()),
    title: String(task.title || `Task ${index + 1}`),
    description: String(task.description || ""),
    assigneeId: String(task.assigneeId || ""),
    dueAt: Number.isNaN(dueAt.getTime()) ? new Date().toISOString() : dueAt.toISOString(),
    urgency: ["Low", "Medium", "High", "Critical"].includes(task.urgency) ? task.urgency : "Medium",
    status: task.status === "Completed" ? "Completed" : "Pending",
    reminderEveryMinutes: Math.max(1, Number(task.reminderEveryMinutes) || 60),
    persistentReminders: Boolean(task.persistentReminders),
    nextReminderAt: nextReminderAt && !Number.isNaN(nextReminderAt.getTime()) ? nextReminderAt.toISOString() : null,
    lastReminderAt: lastReminderAt && !Number.isNaN(lastReminderAt.getTime()) ? lastReminderAt.toISOString() : null,
    attachments: Array.isArray(task.attachments)
      ? task.attachments
          .filter((attachment) => attachment && attachment.dataUrl)
          .map((attachment) => ({
            id: String(attachment.id || generateId()),
            name: String(attachment.name || "attachment"),
            type: String(attachment.type || "application/octet-stream"),
            size: Math.max(0, Number(attachment.size) || 0),
            dataUrl: String(attachment.dataUrl),
            uploadedAt: attachment.uploadedAt || new Date().toISOString()
          }))
      : [],
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
    updatedAt: Number.isNaN(updatedAt.getTime())
      ? (Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString())
      : updatedAt.toISOString(),
    completedAt: completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt.toISOString() : null
  };
}

function normalizeNotificationRecord(notification, index) {
  return {
    id: String(notification.id || generateId()),
    employeeId: String(notification.employeeId || ""),
    taskId: notification.taskId ? String(notification.taskId) : null,
    type: String(notification.type || "general"),
    channel: notification.channel === "whatsapp" ? "whatsapp" : "app",
    message: String(notification.message || ""),
    meta: notification.meta && typeof notification.meta === "object" ? notification.meta : null,
    createdAt: notification.createdAt || new Date().toISOString()
  };
}

function normalizeMessageRecord(message, index) {
  return {
    id: String(message.id || generateId()),
    employeeId: String(message.employeeId || ""),
    taskId: message.taskId ? String(message.taskId) : null,
    senderRole: message.senderRole === "manager" ? "manager" : "employee",
    content: String(message.content || ""),
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function normalizeVendorRecord(vendor, index) {
  return {
    id: String(vendor.id || generateId()),
    name: String(vendor.name || `Vendor ${index + 1}`),
    contactEmail: normalizeEmail(vendor.contactEmail || ""),
    goods: Array.isArray(vendor.goods)
      ? vendor.goods.map((item) => String(item)).filter(Boolean)
      : parseGoodsList(vendor.goods || ""),
    defaultCostPrice: Number(vendor.defaultCostPrice) || 0,
    createdAt: vendor.createdAt || new Date().toISOString(),
    updatedAt: vendor.updatedAt || vendor.createdAt || new Date().toISOString()
  };
}

function normalizePurchaseOrderRecord(po, index) {
  return {
    id: String(po.id || generateId()),
    vendorId: String(po.vendorId || ""),
    poNumber: String(po.poNumber || `PO-${index + 1}`),
    goods: String(po.goods || ""),
    quantity: Math.max(1, Number(po.quantity) || 1),
    costPrice: Number(po.costPrice) || 0,
    raisedAt: po.raisedAt || new Date().toISOString(),
    expectedAt: po.expectedAt || null,
    status: String(po.status || "Open"),
    createdAt: po.createdAt || new Date().toISOString()
  };
}

function normalizeVendorAlertRecord(alertItem, index) {
  return {
    id: String(alertItem.id || generateId()),
    vendorId: String(alertItem.vendorId || ""),
    poId: alertItem.poId ? String(alertItem.poId) : null,
    priority: ["Low", "Medium", "High", "Critical"].includes(alertItem.priority)
      ? alertItem.priority
      : "Medium",
    message: String(alertItem.message || ""),
    sentBy: String(alertItem.sentBy || ""),
    createdAt: alertItem.createdAt || new Date().toISOString()
  };
}

function normalizeWorkspaceState(payload) {
  return {
    employees: Array.isArray(payload.employees)
      ? payload.employees.map((employee, index) => normalizeEmployeeRecord(employee, index))
      : [],
    tasks: Array.isArray(payload.tasks)
      ? payload.tasks.map((task, index) => normalizeTaskRecord(task, index))
      : [],
    notifications: Array.isArray(payload.notifications)
      ? payload.notifications.map((notification, index) => normalizeNotificationRecord(notification, index))
      : [],
    messages: Array.isArray(payload.messages)
      ? payload.messages.map((message, index) => normalizeMessageRecord(message, index))
      : [],
    vendors: Array.isArray(payload.vendors)
      ? payload.vendors.map((vendor, index) => normalizeVendorRecord(vendor, index))
      : [],
    purchaseOrders: Array.isArray(payload.purchaseOrders)
      ? payload.purchaseOrders.map((po, index) => normalizePurchaseOrderRecord(po, index))
      : [],
    vendorAlerts: Array.isArray(payload.vendorAlerts)
      ? payload.vendorAlerts.map((alertItem, index) => normalizeVendorAlertRecord(alertItem, index))
      : []
  };
}

async function refreshWorkspaceFromApi(shouldSave) {
  if (!isAuthenticated()) {
    return;
  }

  const payload = await apiRequest("/workspace", { requiresAuth: true });
  const workspace = normalizeWorkspaceState(payload || {});

  state.employees = workspace.employees;
  state.tasks = workspace.tasks;
  state.notifications = workspace.notifications;
  state.messages = workspace.messages;
  state.vendors = workspace.vendors;
  state.purchaseOrders = workspace.purchaseOrders;
  state.vendorAlerts = workspace.vendorAlerts;

  if (isEmployeeSession()) {
    const ownId = state.session.employeeId || state.session.userId || null;
    state.settings.selectedEmployeeId = ownId;
    state.settings.managerMessageEmployeeId = ownId;
    state.settings.activeRole = "employee";
  } else if (isManagerSession()) {
    if (state.employees.length) {
      if (!state.employees.some((employee) => employee.id === state.settings.selectedEmployeeId)) {
        state.settings.selectedEmployeeId = state.employees[0].id;
      }
      if (!state.employees.some((employee) => employee.id === state.settings.managerMessageEmployeeId)) {
        state.settings.managerMessageEmployeeId = state.employees[0].id;
      }
    } else {
      state.settings.selectedEmployeeId = null;
      state.settings.managerMessageEmployeeId = null;
    }
  }

  if (shouldSave !== false) {
    saveState();
  }
}

async function hydrateSessionFromApi() {
  if (!state.session || !state.session.token) {
    return;
  }

  try {
    const payload = await apiRequest("/auth/me", { requiresAuth: true });
    const user = payload.user || {};
    if (!user.id || !user.role) {
      throw new Error("Invalid session payload.");
    }

    const role = user.role === "manager" ? "manager" : "employee";
    state.session = {
      token: String(state.session.token),
      role,
      userId: user.id,
      employeeId: role === "employee" ? user.id : null,
      email: normalizeEmail(user.email),
      name: String(user.name || user.email || "User"),
      phone: normalizePhone(user.phone),
      loggedInAt: state.session.loggedInAt || new Date().toISOString(),
      expiresAt: payload.expiresAt || state.session.expiresAt || null
    };

    if (role === "manager") {
      if (!["manager", "employee", "vendor"].includes(state.settings.activeRole)) {
        state.settings.activeRole = "manager";
      }
    } else {
      state.settings.selectedEmployeeId = user.id;
      state.settings.managerMessageEmployeeId = user.id;
      state.settings.activeRole = "employee";
    }
    await refreshWorkspaceFromApi(false);

    saveState();
  } catch (error) {
    console.warn("Failed to restore backend session:", error);
    clearSessionState();
    saveState();
  }
}

function normalizeLoadedState() {
  const emailSet = new Set();
  state.employees = Array.isArray(state.employees)
    ? state.employees.map((employee, index) => {
        const fixed = normalizeEmployeeRecord(employee, index);
        let candidateEmail = fixed.email || `employee.${index + 1}@taskapp.local`;
        let suffix = 1;
        while (emailSet.has(candidateEmail)) {
          candidateEmail = `${slugify(fixed.name || "employee")}.${index + 1}.${suffix}@taskapp.local`;
          suffix += 1;
        }
        emailSet.add(candidateEmail);
        fixed.email = candidateEmail;
        return fixed;
      })
    : [];

  state.tasks = Array.isArray(state.tasks)
    ? state.tasks.map((task) => ({
        ...task,
        attachments: Array.isArray(task.attachments) ? task.attachments : []
      }))
    : [];

  state.vendors = Array.isArray(state.vendors)
    ? state.vendors.map((vendor, index) => ({
        id: vendor.id || generateId(),
        name: String(vendor.name || `Vendor ${index + 1}`),
        contactEmail: normalizeEmail(vendor.contactEmail || ""),
        goods: Array.isArray(vendor.goods)
          ? vendor.goods.map((item) => String(item)).filter(Boolean)
          : parseGoodsList(vendor.goods || ""),
        defaultCostPrice: Number(vendor.defaultCostPrice) || 0,
        createdAt: vendor.createdAt || new Date().toISOString()
      }))
    : [];

  state.purchaseOrders = Array.isArray(state.purchaseOrders)
    ? state.purchaseOrders.map((po) => ({
        ...po,
        quantity: Math.max(1, Number(po.quantity) || 1),
        costPrice: Number(po.costPrice) || 0,
        status: po.status || "Open"
      }))
    : [];

  state.vendorAlerts = Array.isArray(state.vendorAlerts)
    ? state.vendorAlerts.map((alertItem) => ({
        ...alertItem,
        priority: alertItem.priority || "Medium"
      }))
    : [];

  state.settings = {
    ...cloneDefaultState().settings,
    ...(state.settings && typeof state.settings === "object" ? state.settings : {})
  };

  if (!state.settings.calendarSelectedDate) {
    state.settings.calendarSelectedDate = todayDateKey();
  }

  if (!state.session || !state.session.role || !state.session.token) {
    state.session = null;
  } else if (state.session.role === "employee") {
    const employeeId = state.session.employeeId || state.session.userId || null;
    state.session = {
      ...state.session,
      role: "employee",
      token: String(state.session.token),
      email: normalizeEmail(state.session.email),
      userId: state.session.userId || employeeId,
      employeeId
    };
    const employee = employeeId ? getEmployeeById(employeeId) : null;
    if (employee && state.settings.selectedEmployeeId !== employee.id) {
      state.settings.selectedEmployeeId = employee.id;
    }
  } else if (state.session.role === "manager") {
    state.session = {
      ...state.session,
      role: "manager",
      token: String(state.session.token),
      email: normalizeEmail(state.session.email),
      userId: state.session.userId || null,
      employeeId: null
    };
  } else {
    state.session = null;
  }

  if (!state.settings.selectedEmployeeId && state.employees.length) {
    state.settings.selectedEmployeeId = state.employees[0].id;
  }

  if (!state.settings.managerMessageEmployeeId && state.employees.length) {
    state.settings.managerMessageEmployeeId = state.employees[0].id;
  }

  if (!["manager", "employee", "vendor"].includes(state.settings.activeRole)) {
    state.settings.activeRole = "manager";
  }

  if (isEmployeeSession()) {
    state.settings.activeRole = "employee";
  }

  saveState();
}

async function handleLogin() {
  const email = normalizeEmail(elements.loginEmail.value);
  const password = String(elements.loginPassword.value || "");

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  try {
    const payload = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password }
    });
    const user = payload.user || {};

    if (!payload.token || !user.id || !user.role) {
      throw new Error("Login response was invalid.");
    }

    const role = user.role === "manager" ? "manager" : "employee";
    state.session = {
      token: String(payload.token),
      role,
      userId: user.id,
      employeeId: role === "employee" ? user.id : null,
      email: normalizeEmail(user.email),
      name: String(user.name || user.email || "User"),
      phone: normalizePhone(user.phone),
      loggedInAt: new Date().toISOString(),
      expiresAt: payload.expiresAt || null
    };

    if (role === "manager") {
      if (!["manager", "employee", "vendor"].includes(state.settings.activeRole)) {
        state.settings.activeRole = "manager";
      }
    } else {
      state.settings.selectedEmployeeId = user.id;
      state.settings.managerMessageEmployeeId = user.id;
      state.settings.activeRole = "employee";
    }
    await refreshWorkspaceFromApi(false);

    saveState();
    elements.loginForm.reset();
    render();
  } catch (error) {
    alert(error.message || "Unable to log in right now.");
  }
}

async function handleLogout() {
  if (state.session && state.session.token) {
    try {
      await apiRequest("/auth/logout", { method: "POST", requiresAuth: true });
    } catch (error) {
      console.warn("Logout API call failed:", error);
    }
  }

  clearSessionState();
  saveState();
  render();
}

function isAuthenticated() {
  return Boolean(state.session && state.session.role && state.session.token);
}

function isManagerSession() {
  return isAuthenticated() && state.session.role === "manager";
}

function isEmployeeSession() {
  return isAuthenticated() && state.session.role === "employee";
}

function getSessionEmployee() {
  if (!isEmployeeSession()) {
    return null;
  }

  const employee = getEmployeeById(state.session.employeeId);
  if (employee) {
    return employee;
  }

  return {
    id: state.session.employeeId || state.session.userId || "session-employee",
    name: String(state.session.name || "Employee"),
    email: normalizeEmail(state.session.email),
    phone: normalizePhone(state.session.phone),
    createdAt: state.session.loggedInAt || new Date().toISOString(),
    updatedAt: state.session.loggedInAt || new Date().toISOString()
  };
}

function switchRole(role) {
  if (!isAuthenticated()) {
    return;
  }

  if (isEmployeeSession()) {
    state.settings.activeRole = "employee";
    saveState();
    renderRolePanels();
    return;
  }

  if (!["manager", "employee", "vendor"].includes(role)) {
    return;
  }

  state.settings.activeRole = role;
  saveState();
  renderRolePanels();
}

function setDefaultDueDate() {
  if (elements.taskDueAt.value) {
    return;
  }
  const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  elements.taskDueAt.value = toDatetimeLocalValue(inOneDay);
}

function setDefaultPoRaisedDate() {
  if (elements.poRaisedAt.value) {
    return;
  }
  elements.poRaisedAt.value = toDateInputValue(new Date());
}

async function addEmployee() {
  if (!isManagerSession()) {
    alert("Only managers can add employees.");
    return;
  }

  const name = elements.employeeName.value.trim();
  const email = normalizeEmail(elements.employeeEmail.value);
  const password = String(elements.employeePassword.value || "").trim();
  const phone = normalizePhone(elements.employeePhone.value);

  if (!name || !email || !password || !phone) {
    alert("Name, email, password, and WhatsApp number are required.");
    return;
  }

  try {
    await apiRequest("/employees", {
      method: "POST",
      requiresAuth: true,
      body: { name, email, password, phone }
    });
    await refreshWorkspaceFromApi(false);

    elements.employeeForm.reset();
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to create employee right now.");
  }
}

async function assignTask() {
  if (!isManagerSession()) {
    alert("Only managers can assign tasks.");
    return;
  }

  if (!state.employees.length) {
    alert("Please add at least one employee before assigning tasks.");
    return;
  }

  const title = elements.taskTitle.value.trim();
  const description = elements.taskDescription.value.trim();
  const assigneeId = elements.taskAssignee.value;
  const dueAtRaw = elements.taskDueAt.value;
  const urgency = elements.taskUrgency.value;
  const reminderEveryMinutes = Math.max(1, Number(elements.taskReminderMinutes.value) || 60);
  const persistentReminders = Boolean(elements.taskPersistentReminders.checked);
  const attachments = draftAttachments.map((attachment) => ({ ...attachment }));

  if (!title || !assigneeId || !dueAtRaw) {
    alert("Task title, assignee, and due date are required.");
    return;
  }

  const dueDate = new Date(dueAtRaw);
  if (Number.isNaN(dueDate.getTime())) {
    alert("Invalid due date.");
    return;
  }

  try {
    const payload = await apiRequest("/tasks", {
      method: "POST",
      requiresAuth: true,
      body: {
        title,
        description,
        assigneeId,
        dueAt: dueDate.toISOString(),
        urgency,
        reminderEveryMinutes,
        persistentReminders,
        attachments
      }
    });

    if (state.settings.autoOpenWhatsApp && payload.whatsappUrl) {
      window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
    }

    const employee = getEmployeeById(assigneeId);
    notifyBrowser(
      "New Task Assigned",
      `${employee ? employee.name : "Employee"} has a ${urgency.toLowerCase()} priority task.`
    );

    elements.taskForm.reset();
    elements.taskReminderMinutes.value = String(reminderEveryMinutes);
    elements.taskPersistentReminders.checked = persistentReminders;
    elements.autoOpenWhatsApp.checked = state.settings.autoOpenWhatsApp;
    setDefaultDueDate();
    clearDraftAttachments(false);

    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to assign task right now.");
  }
}

async function completeTask(taskId, completedBy) {
  const task = getTaskById(taskId);
  if (task && task.status === "Completed") {
    return;
  }

  if (completedBy === "manager" && !isManagerSession()) {
    alert("Only managers can use this action.");
    return;
  }

  if (completedBy === "employee") {
    if (!isEmployeeSession()) {
      alert("Only logged-in employees can use this action.");
      return;
    }
    if (task && state.session.employeeId !== task.assigneeId) {
      alert("You can complete only your own tasks.");
      return;
    }
  }
  try {
    await apiRequest(`/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: "POST",
      requiresAuth: true
    });
    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to complete task right now.");
  }
}

function openWhatsApp(taskId, contextText) {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }

  if (isEmployeeSession() && state.session.employeeId !== task.assigneeId) {
    alert("You can open WhatsApp only for your own tasks.");
    return;
  }

  const employee = getEmployeeById(task.assigneeId);
  if (!employee || !employee.phone) {
    alert("This employee does not have a valid WhatsApp number.");
    return;
  }

  const whatsappUrl = buildWhatsAppUrl(employee, task, contextText);
  if (!whatsappUrl) {
    alert("Could not generate WhatsApp URL.");
    return;
  }

  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
}

async function sendReminderNow(taskId, source, options = {}) {
  const skipRefresh = Boolean(options.skipRefresh);
  const task = getTaskById(taskId);
  if (task && task.status === "Completed") {
    return false;
  }

  if (!isManagerSession()) {
    if (source === "manual") {
      alert("Only managers can send reminders.");
    }
    return false;
  }

  try {
    const payload = await apiRequest(`/tasks/${encodeURIComponent(taskId)}/reminder`, {
      method: "POST",
      requiresAuth: true,
      body: { source }
    });

    if (source === "manual" && state.settings.autoOpenWhatsApp && payload.whatsappUrl) {
      window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
    }

    const taskForNotice = payload && payload.task ? normalizeTaskRecord(payload.task, 0) : task;
    const employee = taskForNotice ? getEmployeeById(taskForNotice.assigneeId) : null;
    if (taskForNotice) {
      notifyBrowser(
        "Persistent Reminder",
        `${employee ? employee.name : "Employee"}: "${taskForNotice.title}" is still pending (${taskForNotice.urgency}).`
      );
    }

    if (!skipRefresh) {
      await refreshWorkspaceFromApi(false);
      saveState();
      render();
    }

    return true;
  } catch (error) {
    if (source === "manual") {
      alert(error.message || "Unable to send reminder right now.");
    } else {
      console.warn("Automatic reminder failed:", error);
    }
    return false;
  }
}

async function runReminderSweep() {
  if (!isManagerSession()) {
    return;
  }

  const now = Date.now();
  const dueTaskIds = [];

  for (const task of state.tasks) {
    if (task.status === "Completed" || !task.persistentReminders) {
      continue;
    }

    const nextReminder = task.nextReminderAt ? new Date(task.nextReminderAt).getTime() : NaN;
    if (!Number.isFinite(nextReminder) || nextReminder <= now) {
      dueTaskIds.push(task.id);
    }
  }

  if (!dueTaskIds.length) {
    return;
  }

  let changed = false;
  for (const taskId of dueTaskIds) {
    const sent = await sendReminderNow(taskId, "automatic", { skipRefresh: true });
    if (sent) {
      changed = true;
    }
  }

  if (changed) {
    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  }
}

function startReminderEngine() {
  setInterval(() => {
    runReminderSweep().catch((error) => {
      console.warn("Reminder sweep failed:", error);
    });
  }, 30000);
}

function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }

  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      alert("Browser reminders enabled.");
    } else {
      alert("Notification permission not granted.");
    }
  });
}

function notifyBrowser(title, body) {
  if (!("Notification" in window)) {
    return;
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

async function addDraftAttachmentsFromFiles(fileList) {
  if (!isManagerSession()) {
    alert("Only managers can attach files while assigning tasks.");
    return;
  }

  const files = Array.from(fileList || []);
  if (!files.length) {
    return;
  }

  const issues = [];
  let totalBytes = draftAttachments.reduce((sum, attachment) => sum + (Number(attachment.size) || 0), 0);

  for (const file of files) {
    if (draftAttachments.length >= MAX_ATTACHMENT_COUNT) {
      issues.push(`Skipped "${file.name}": maximum ${MAX_ATTACHMENT_COUNT} attachments allowed.`);
      continue;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      issues.push(`Skipped "${file.name}": file is larger than ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`);
      continue;
    }

    if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      issues.push(`Skipped "${file.name}": total attachment size exceeds ${formatFileSize(MAX_TOTAL_ATTACHMENT_BYTES)}.`);
      continue;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      draftAttachments.push({
        id: generateId(),
        name: file.name || "attachment",
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        dataUrl,
        uploadedAt: new Date().toISOString()
      });
      totalBytes += file.size || 0;
    } catch (error) {
      issues.push(`Skipped "${file.name}": could not read the file.`);
    }
  }

  renderDraftAttachments();
  if (issues.length) {
    alert(issues.join("\n"));
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function removeDraftAttachment(attachmentId) {
  draftAttachments = draftAttachments.filter((attachment) => attachment.id !== attachmentId);
  renderDraftAttachments();
}

function clearDraftAttachments(shouldRender) {
  draftAttachments = [];
  elements.taskAttachmentInput.value = "";
  if (shouldRender !== false) {
    renderDraftAttachments();
  }
}

function renderDraftAttachments() {
  if (!draftAttachments.length) {
    elements.draftAttachmentList.innerHTML = "<div class=\"empty\">No attachments selected yet.</div>";
    return;
  }

  elements.draftAttachmentList.innerHTML = draftAttachments
    .map(
      (attachment) => `
        <div class="attachment-item">
          <span>${escapeHtml(attachment.name)} (${formatFileSize(Number(attachment.size) || 0)})</span>
          <button class="secondary" type="button" data-action="remove-draft-attachment" data-attachment-id="${attachment.id}">Remove</button>
        </div>
      `
    )
    .join("");
}

async function sendInternalMessage(senderRole) {
  const isManagerSender = senderRole === "manager";
  if (isManagerSender && !isManagerSession()) {
    alert("Only managers can send manager messages.");
    return;
  }
  if (!isManagerSender && !isEmployeeSession()) {
    alert("Only employees can send employee messages.");
    return;
  }

  const employeeId = isManagerSender
    ? elements.managerMessageEmployeeSelect.value
    : state.session.employeeId;
  const taskId = isManagerSender
    ? elements.managerMessageTaskSelect.value
    : elements.employeeMessageTaskSelect.value;
  const inputElement = isManagerSender ? elements.managerMessageInput : elements.employeeMessageInput;
  const content = inputElement.value.trim();

  if (!employeeId) {
    alert("Please choose an employee.");
    return;
  }

  if (!content) {
    alert("Message cannot be empty.");
    return;
  }

  if (!getEmployeeById(employeeId)) {
    alert("Invalid employee selection.");
    return;
  }

  if (taskId) {
    const task = getTaskById(taskId);
    if (!task || task.assigneeId !== employeeId) {
      alert("Selected task does not belong to this employee.");
      return;
    }
  }
  try {
    await apiRequest("/messages", {
      method: "POST",
      requiresAuth: true,
      body: {
        employeeId,
        taskId: taskId || null,
        content
      }
    });

    inputElement.value = "";
    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to send message right now.");
  }
}

async function addVendor() {
  if (!isManagerSession()) {
    alert("Only managers can add vendors.");
    return;
  }

  const name = elements.vendorName.value.trim();
  const contactEmail = normalizeEmail(elements.vendorContactEmail.value);
  const goods = parseGoodsList(elements.vendorGoods.value);
  const defaultCostPrice = Number(elements.vendorDefaultCostPrice.value);

  if (!name || !goods.length || !Number.isFinite(defaultCostPrice) || defaultCostPrice < 0) {
    alert("Vendor name, goods, and valid default cost price are required.");
    return;
  }

  const duplicate = state.vendors.some(
    (vendor) => vendor.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (duplicate) {
    alert("A vendor with that name already exists.");
    return;
  }
  try {
    await apiRequest("/vendors", {
      method: "POST",
      requiresAuth: true,
      body: {
        name,
        contactEmail,
        goods,
        defaultCostPrice
      }
    });

    elements.vendorForm.reset();
    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to add vendor right now.");
  }
}

async function addPurchaseOrder() {
  if (!isManagerSession()) {
    alert("Only managers can create purchase orders.");
    return;
  }

  const vendorId = elements.poVendorSelect.value;
  const poNumber = elements.poNumber.value.trim();
  const goods = elements.poGoods.value.trim();
  const quantity = Math.max(1, Number(elements.poQuantity.value) || 1);
  const costPrice = Number(elements.poCostPrice.value);
  const raisedAtRaw = elements.poRaisedAt.value;
  const expectedAtRaw = elements.poExpectedAt.value;
  const status = elements.poStatus.value;

  if (!vendorId || !poNumber || !goods || !raisedAtRaw || !Number.isFinite(costPrice) || costPrice < 0) {
    alert("Vendor, PO number, goods, raised date, and valid cost price are required.");
    return;
  }

  const vendor = getVendorById(vendorId);
  if (!vendor) {
    alert("Selected vendor does not exist.");
    return;
  }

  const duplicatePoNumber = state.purchaseOrders.some(
    (po) => po.poNumber.trim().toLowerCase() === poNumber.trim().toLowerCase()
  );
  if (duplicatePoNumber) {
    alert("That PO number already exists.");
    return;
  }

  const raisedAtDate = new Date(`${raisedAtRaw}T00:00:00`);
  if (Number.isNaN(raisedAtDate.getTime())) {
    alert("Invalid raised date.");
    return;
  }

  let expectedAt = null;
  if (expectedAtRaw) {
    const expectedDate = new Date(`${expectedAtRaw}T00:00:00`);
    if (Number.isNaN(expectedDate.getTime())) {
      alert("Invalid expected date.");
      return;
    }
    expectedAt = expectedDate.toISOString();
  }
  try {
    await apiRequest("/purchase-orders", {
      method: "POST",
      requiresAuth: true,
      body: {
        vendorId,
        poNumber,
        goods,
        quantity,
        costPrice,
        raisedAt: raisedAtDate.toISOString(),
        expectedAt,
        status
      }
    });

    elements.poForm.reset();
    setDefaultPoRaisedDate();
    prefillPoCostPriceFromVendor(true);
    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to create purchase order right now.");
  }
}

async function sendVendorAlert() {
  if (!isManagerSession()) {
    alert("Only managers can send vendor alerts.");
    return;
  }

  const vendorId = elements.vendorAlertVendorSelect.value;
  const poId = elements.vendorAlertPoSelect.value;
  const priority = elements.vendorAlertPriority.value;
  const message = elements.vendorAlertMessage.value.trim();

  if (!vendorId || !message) {
    alert("Vendor and alert message are required.");
    return;
  }

  const vendor = getVendorById(vendorId);
  if (!vendor) {
    alert("Selected vendor does not exist.");
    return;
  }

  if (poId) {
    const po = getPurchaseOrderById(poId);
    if (!po || po.vendorId !== vendorId) {
      alert("Selected PO does not belong to this vendor.");
      return;
    }
  }
  try {
    await apiRequest("/vendor-alerts", {
      method: "POST",
      requiresAuth: true,
      body: {
        vendorId,
        poId: poId || null,
        priority,
        message
      }
    });

    elements.vendorAlertMessage.value = "";
    await refreshWorkspaceFromApi(false);
    saveState();
    render();
  } catch (error) {
    alert(error.message || "Unable to send vendor alert right now.");
  }
}

function render() {
  renderAuthState();
  if (!isAuthenticated()) {
    return;
  }

  renderRolePanels();
  renderEmployeeSelectors();
  renderVendorSelectors();
  renderEmployees();
  renderDraftAttachments();
  renderManagerDashboard();
  renderEmployeeView();
  renderVendorAssessment();
  renderCalendar();
  elements.autoOpenWhatsApp.checked = Boolean(state.settings.autoOpenWhatsApp);
}

function renderAuthState() {
  const authenticated = isAuthenticated();
  elements.loginPanel.classList.toggle("hidden", authenticated);
  elements.workspaceShell.classList.toggle("hidden", !authenticated);
  elements.sessionInfo.classList.toggle("hidden", !authenticated);

  if (!authenticated) {
    elements.sessionLabel.textContent = "";
    return;
  }

  if (isManagerSession()) {
    const managerEmail = normalizeEmail((state.session && state.session.email) || "manager@taskapp.local");
    elements.sessionLabel.textContent = `Signed in as Manager (${managerEmail})`;
  } else {
    const employee = getSessionEmployee();
    const display = employee
      ? `${employee.name} (${normalizeEmail(employee.email)})`
      : "Employee";
    elements.sessionLabel.textContent = `Signed in as ${display}`;
  }
}

function renderRolePanels() {
  if (!isAuthenticated()) {
    return;
  }

  const managerAccess = isManagerSession();
  if (!managerAccess) {
    state.settings.activeRole = "employee";
  }

  const activeRole = state.settings.activeRole;

  elements.managerViewBtn.classList.toggle("hidden", !managerAccess);
  elements.vendorViewBtn.classList.toggle("hidden", !managerAccess);

  elements.managerViewBtn.classList.toggle("active", managerAccess && activeRole === "manager");
  elements.employeeViewBtn.classList.toggle("active", activeRole === "employee");
  elements.vendorViewBtn.classList.toggle("active", managerAccess && activeRole === "vendor");

  elements.managerPanel.classList.toggle("active", managerAccess && activeRole === "manager");
  elements.employeePanel.classList.toggle("active", activeRole === "employee");
  elements.vendorPanel.classList.toggle("active", managerAccess && activeRole === "vendor");
}

function renderEmployeeSelectors() {
  const managerAccess = isManagerSession();
  const sessionEmployee = getSessionEmployee();
  const selectableEmployees = managerAccess
    ? state.employees
    : sessionEmployee
      ? [sessionEmployee]
      : [];

  if (!selectableEmployees.length) {
    elements.taskAssignee.innerHTML = "<option value=\"\">No employees available</option>";
    elements.employeeSelectDashboard.innerHTML = "<option value=\"\">No employees available</option>";
    elements.managerMessageEmployeeSelect.innerHTML = "<option value=\"\">No employees available</option>";
    elements.employeeMessageTaskSelect.innerHTML = "<option value=\"\">No task context</option>";
    elements.managerMessageTaskSelect.innerHTML = "<option value=\"\">No task context</option>";
    return;
  }

  const scopedOptions = selectableEmployees
    .map(
      (employee) =>
        `<option value="${employee.id}">${escapeHtml(employee.name)} (${escapeHtml(employee.email)})</option>`
    )
    .join("");

  const allOptions = state.employees
    .map(
      (employee) =>
        `<option value="${employee.id}">${escapeHtml(employee.name)} (${escapeHtml(employee.email)})</option>`
    )
    .join("");

  elements.taskAssignee.innerHTML = managerAccess ? allOptions : scopedOptions;
  elements.employeeSelectDashboard.innerHTML = scopedOptions;
  elements.managerMessageEmployeeSelect.innerHTML = managerAccess ? allOptions : scopedOptions;

  if (managerAccess) {
    if (
      !state.settings.selectedEmployeeId ||
      !state.employees.some((employee) => employee.id === state.settings.selectedEmployeeId)
    ) {
      state.settings.selectedEmployeeId = state.employees[0].id;
    }

    if (
      !state.settings.managerMessageEmployeeId ||
      !state.employees.some((employee) => employee.id === state.settings.managerMessageEmployeeId)
    ) {
      state.settings.managerMessageEmployeeId = state.employees[0].id;
    }

    elements.employeeSelectDashboard.disabled = false;
    elements.employeeSelectDashboard.value = state.settings.selectedEmployeeId;
    elements.managerMessageEmployeeSelect.value = state.settings.managerMessageEmployeeId;

    if (!elements.taskAssignee.value || !state.employees.some((employee) => employee.id === elements.taskAssignee.value)) {
      elements.taskAssignee.value = state.employees[0].id;
    }
  } else {
    const ownId = sessionEmployee ? sessionEmployee.id : selectableEmployees[0].id;
    state.settings.selectedEmployeeId = ownId;
    state.settings.managerMessageEmployeeId = ownId;

    elements.employeeSelectDashboard.disabled = true;
    elements.employeeSelectDashboard.value = ownId;
    elements.managerMessageEmployeeSelect.value = ownId;
    elements.taskAssignee.value = ownId;
  }
}

function renderEmployees() {
  if (!state.employees.length) {
    elements.employeeList.innerHTML = "<div class=\"empty\">No employees added yet.</div>";
    return;
  }

  elements.employeeList.innerHTML = state.employees
    .map(
      (employee) => `
        <div class="employee-card">
          <div><strong>${escapeHtml(employee.name)}</strong></div>
          <div class="meta">Email: ${escapeHtml(employee.email)}</div>
          <div class="meta">WhatsApp: ${escapeHtml(employee.phone)}</div>
          <div class="meta">Added: ${formatDateTime(employee.createdAt)}</div>
        </div>
      `
    )
    .join("");
}

function renderManagerDashboard() {
  if (!isManagerSession()) {
    elements.urgencySummary.innerHTML = "";
    elements.managerTaskList.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    elements.employeeAnalyticsList.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    elements.managerConversation.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    return;
  }

  renderUrgencySummary();
  renderManagerTasks();
  renderEmployeeAnalytics();
  renderManagerMessaging();
}

function renderUrgencySummary() {
  const pendingTasks = state.tasks.filter((task) => task.status === "Pending");

  const counts = {
    Low: pendingTasks.filter((task) => task.urgency === "Low").length,
    Medium: pendingTasks.filter((task) => task.urgency === "Medium").length,
    High: pendingTasks.filter((task) => task.urgency === "High").length,
    Critical: pendingTasks.filter((task) => task.urgency === "Critical").length
  };

  elements.urgencySummary.innerHTML = `
    <span class="pill low">Low: ${counts.Low}</span>
    <span class="pill medium">Medium: ${counts.Medium}</span>
    <span class="pill high">High: ${counts.High}</span>
    <span class="pill critical">Critical: ${counts.Critical}</span>
  `;
}

function renderManagerTasks() {
  if (!state.tasks.length) {
    elements.managerTaskList.innerHTML = "<div class=\"empty\">No tasks assigned yet.</div>";
    return;
  }

  const sortedTasks = [...state.tasks].sort(compareTasksForPriority);
  elements.managerTaskList.innerHTML = sortedTasks
    .map((task) => {
      const employee = getEmployeeById(task.assigneeId);
      const urgencyClass = task.status === "Completed" ? "completed" : task.urgency.toLowerCase();
      const canAct = task.status !== "Completed" && isManagerSession();
      return `
        <div class="task-card ${urgencyClass}">
          <div class="task-top">
            <div>
              <p class="task-title">${escapeHtml(task.title)}</p>
              <div class="meta">Employee: ${escapeHtml(employee ? employee.name : "Unknown")}</div>
              <div class="meta">Due: ${formatDateTime(task.dueAt)}</div>
              <div class="meta">Urgency: ${escapeHtml(task.urgency)}</div>
              <div class="meta">Status: ${escapeHtml(task.status)}</div>
              <div class="meta">Next reminder: ${task.nextReminderAt ? formatDateTime(task.nextReminderAt) : "Not scheduled"}</div>
              ${
                task.description
                  ? `<div class="meta">Details: ${escapeHtml(task.description)}</div>`
                  : ""
              }
              ${renderTaskAttachments(task)}
            </div>
            <span class="pill ${urgencyClass}">${escapeHtml(task.status === "Completed" ? "Completed" : task.urgency)}</span>
          </div>
          <div class="task-actions">
            <button class="muted" data-action="manager-whatsapp" data-task-id="${task.id}">Open WhatsApp</button>
            <button class="warning" data-action="manager-reminder" data-task-id="${task.id}" ${canAct ? "" : "disabled"}>Send Reminder Now</button>
            <button data-action="manager-complete" data-task-id="${task.id}" ${canAct ? "" : "disabled"}>Mark Complete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderEmployeeAnalytics() {
  if (!state.employees.length) {
    elements.employeeAnalyticsList.innerHTML = "<div class=\"empty\">Add employees to generate analytics.</div>";
    return;
  }

  elements.employeeAnalyticsList.innerHTML = state.employees
    .map((employee) => {
      const metrics = computeEmployeeAnalytics(employee.id);
      return `
        <div class="analytics-card">
          <div class="analytics-title">${escapeHtml(employee.name)}</div>
          <div class="analytics-metrics">
            <div class="metric-chip">Assigned: <strong>${metrics.assigned}</strong></div>
            <div class="metric-chip">Completed: <strong>${metrics.completed}</strong></div>
            <div class="metric-chip">Pending: <strong>${metrics.pending}</strong></div>
            <div class="metric-chip">Overdue: <strong>${metrics.overdue}</strong></div>
            <div class="metric-chip">On-time: <strong>${metrics.onTime}</strong></div>
            <div class="metric-chip">Late: <strong>${metrics.late}</strong></div>
            <div class="metric-chip">Completion rate: <strong>${metrics.completionRate}%</strong></div>
            <div class="metric-chip">On-time rate: <strong>${metrics.onTimeRate}%</strong></div>
            <div class="metric-chip">Avg close time: <strong>${metrics.avgCompletionHours}</strong></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function computeEmployeeAnalytics(employeeId) {
  const now = Date.now();
  const employeeTasks = state.tasks.filter((task) => task.assigneeId === employeeId);
  const completedTasks = employeeTasks.filter((task) => task.status === "Completed");
  const pendingTasks = employeeTasks.filter((task) => task.status !== "Completed");

  let onTime = 0;
  let late = 0;
  const completionDurations = [];

  for (const task of completedTasks) {
    const dueAt = new Date(task.dueAt).getTime();
    const completedAt = new Date(task.completedAt).getTime();
    const createdAt = new Date(task.createdAt).getTime();

    if (Number.isFinite(dueAt) && Number.isFinite(completedAt) && completedAt <= dueAt) {
      onTime += 1;
    } else {
      late += 1;
    }

    if (Number.isFinite(createdAt) && Number.isFinite(completedAt) && completedAt >= createdAt) {
      completionDurations.push((completedAt - createdAt) / (1000 * 60 * 60));
    }
  }

  const overdue = pendingTasks.filter((task) => new Date(task.dueAt).getTime() < now).length;
  const completionRate = employeeTasks.length
    ? Math.round((completedTasks.length / employeeTasks.length) * 100)
    : 0;
  const onTimeRate = completedTasks.length
    ? Math.round((onTime / completedTasks.length) * 100)
    : 0;
  const avgCompletionHours = completionDurations.length
    ? `${(completionDurations.reduce((sum, value) => sum + value, 0) / completionDurations.length).toFixed(1)}h`
    : "-";

  return {
    assigned: employeeTasks.length,
    completed: completedTasks.length,
    pending: pendingTasks.length,
    overdue,
    onTime,
    late,
    completionRate,
    onTimeRate,
    avgCompletionHours
  };
}

function renderManagerMessaging() {
  if (!isManagerSession()) {
    elements.managerMessageTaskSelect.innerHTML = "<option value=\"\">No task context</option>";
    elements.managerConversation.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    return;
  }

  const employeeId = state.settings.managerMessageEmployeeId;
  const hasEmployee = Boolean(employeeId && getEmployeeById(employeeId));

  if (!hasEmployee) {
    elements.managerMessageTaskSelect.innerHTML = "<option value=\"\">No task context</option>";
    elements.managerConversation.innerHTML = "<div class=\"empty\">Choose an employee to start messaging.</div>";
    return;
  }

  const tasksForEmployee = state.tasks
    .filter((task) => task.assigneeId === employeeId)
    .sort(compareTasksForPriority);

  const previousSelection = elements.managerMessageTaskSelect.value;
  const options = [
    "<option value=\"\">General (No specific task)</option>",
    ...tasksForEmployee.map(
      (task) =>
        `<option value="${task.id}">${escapeHtml(task.title)} (${escapeHtml(task.status)})</option>`
    )
  ];
  elements.managerMessageTaskSelect.innerHTML = options.join("");
  if (previousSelection && tasksForEmployee.some((task) => task.id === previousSelection)) {
    elements.managerMessageTaskSelect.value = previousSelection;
  } else {
    elements.managerMessageTaskSelect.value = "";
  }

  const messages = getMessagesByEmployee(employeeId);
  renderConversation(elements.managerConversation, messages, "No internal messages for this employee yet.");
}

function renderEmployeeView() {
  renderEmployeeTasks();
  renderEmployeeNotifications();
  renderEmployeeMessaging();
}

function renderEmployeeTasks() {
  const employeeId = state.settings.selectedEmployeeId;
  if (!employeeId) {
    elements.employeeTaskList.innerHTML = "<div class=\"empty\">Select an employee to view assigned tasks.</div>";
    return;
  }

  const employeeTasks = state.tasks
    .filter((task) => task.assigneeId === employeeId)
    .sort(compareTasksForPriority);

  if (!employeeTasks.length) {
    elements.employeeTaskList.innerHTML = "<div class=\"empty\">No tasks assigned to this employee yet.</div>";
    return;
  }

  const employeeSession = getSessionEmployee();
  const canUseEmployeeActions =
    isEmployeeSession() && employeeSession && employeeSession.id === employeeId;

  elements.employeeTaskList.innerHTML = employeeTasks
    .map((task) => {
      const urgencyClass = task.status === "Completed" ? "completed" : task.urgency.toLowerCase();
      return `
        <div class="task-card ${urgencyClass}">
          <div class="task-top">
            <div>
              <p class="task-title">${escapeHtml(task.title)}</p>
              <div class="meta">Due: ${formatDateTime(task.dueAt)}</div>
              <div class="meta">Urgency: ${escapeHtml(task.urgency)}</div>
              <div class="meta">Status: ${escapeHtml(task.status)}</div>
              <div class="meta">Reminder cycle: every ${escapeHtml(String(task.reminderEveryMinutes))} minutes</div>
              ${
                task.description
                  ? `<div class="meta">Details: ${escapeHtml(task.description)}</div>`
                  : ""
              }
              ${renderTaskAttachments(task)}
            </div>
            <span class="pill ${urgencyClass}">${escapeHtml(task.status === "Completed" ? "Completed" : task.urgency)}</span>
          </div>
          <div class="task-actions">
            <button class="muted" data-action="employee-whatsapp" data-task-id="${task.id}" ${canUseEmployeeActions ? "" : "disabled"}>Open WhatsApp</button>
            <button data-action="employee-complete" data-task-id="${task.id}" ${task.status === "Completed" || !canUseEmployeeActions ? "disabled" : ""}>Mark Complete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderEmployeeNotifications() {
  const employeeId = state.settings.selectedEmployeeId;
  if (!employeeId) {
    elements.employeeNotifications.innerHTML = "<div class=\"empty\">Select an employee to view notifications.</div>";
    return;
  }

  const notes = state.notifications
    .filter((notification) => notification.employeeId === employeeId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 80);

  if (!notes.length) {
    elements.employeeNotifications.innerHTML = "<div class=\"empty\">No notifications yet for this employee.</div>";
    return;
  }

  elements.employeeNotifications.innerHTML = notes
    .map((notification) => {
      const channelClass = notification.channel === "whatsapp" ? "whatsapp" : "";
      const channelLabel = notification.channel === "whatsapp" ? "WhatsApp" : "In-App";
      const actionLink =
        notification.meta && notification.meta.url
          ? `<a class="action-link" href="${notification.meta.url}" target="_blank" rel="noopener noreferrer">Send via WhatsApp</a>`
          : "";
      return `
        <div class="note-card ${channelClass}">
          <div><strong>${escapeHtml(channelLabel)}</strong>: ${escapeHtml(notification.message)}</div>
          <div class="meta">${formatDateTime(notification.createdAt)}</div>
          ${actionLink}
        </div>
      `;
    })
    .join("");
}

function renderEmployeeMessaging() {
  const employeeId = state.settings.selectedEmployeeId;
  const employee = getEmployeeById(employeeId);
  const canSendAsEmployee = isEmployeeSession() && employee && state.session.employeeId === employee.id;

  if (!employee) {
    elements.employeeMessageTaskSelect.innerHTML = "<option value=\"\">No task context</option>";
    elements.employeeConversation.innerHTML = "<div class=\"empty\">Select an employee to view messages.</div>";
    return;
  }

  const employeeTasks = state.tasks
    .filter((task) => task.assigneeId === employeeId)
    .sort(compareTasksForPriority);

  const previousSelection = elements.employeeMessageTaskSelect.value;
  const options = [
    "<option value=\"\">General (No specific task)</option>",
    ...employeeTasks.map(
      (task) =>
        `<option value="${task.id}">${escapeHtml(task.title)} (${escapeHtml(task.status)})</option>`
    )
  ];
  elements.employeeMessageTaskSelect.innerHTML = options.join("");
  if (previousSelection && employeeTasks.some((task) => task.id === previousSelection)) {
    elements.employeeMessageTaskSelect.value = previousSelection;
  } else {
    elements.employeeMessageTaskSelect.value = "";
  }

  elements.employeeMessageTaskSelect.disabled = !canSendAsEmployee;
  elements.employeeMessageInput.disabled = !canSendAsEmployee;
  const submitButton = elements.employeeMessageForm.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = !canSendAsEmployee;
  }

  const messages = getMessagesByEmployee(employeeId);
  renderConversation(elements.employeeConversation, messages, "No messages yet.");
}

function renderConversation(container, messages, emptyMessage) {
  if (!messages.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = messages
    .map((message) => {
      const roleLabel = message.senderRole === "manager" ? "Manager" : "Employee";
      const task = message.taskId ? getTaskById(message.taskId) : null;
      const taskMeta = task ? `<div class="meta">Task: ${escapeHtml(task.title)}</div>` : "";
      return `
        <div class="message-bubble ${message.senderRole}">
          <div class="message-role">${roleLabel} · ${formatDateTime(message.createdAt)}</div>
          ${taskMeta}
          <div class="message-text">${escapeHtml(message.content)}</div>
        </div>
      `;
    })
    .join("");

  container.scrollTop = container.scrollHeight;
}

function renderVendorAssessment() {
  if (!isManagerSession()) {
    elements.vendorList.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    elements.poList.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    elements.vendorAlertList.innerHTML = "<div class=\"empty\">Manager access required.</div>";
    return;
  }

  renderVendors();
  renderPurchaseOrders();
  renderVendorAlerts();
}

function renderVendorSelectors() {
  const managerAccess = isManagerSession();
  const hasVendors = state.vendors.length > 0;

  elements.vendorForm.querySelector("button[type='submit']").disabled = !managerAccess;
  elements.poForm.querySelector("button[type='submit']").disabled = !managerAccess;
  elements.vendorAlertForm.querySelector("button[type='submit']").disabled = !managerAccess;

  if (!hasVendors) {
    elements.poVendorSelect.innerHTML = "<option value=\"\">No vendors available</option>";
    elements.vendorAlertVendorSelect.innerHTML = "<option value=\"\">No vendors available</option>";
    elements.vendorAlertPoSelect.innerHTML = "<option value=\"\">No PO context</option>";
    return;
  }

  const vendorOptions = state.vendors
    .map((vendor) => `<option value="${vendor.id}">${escapeHtml(vendor.name)}</option>`)
    .join("");

  const previousPoVendor = elements.poVendorSelect.value;
  const previousAlertVendor = elements.vendorAlertVendorSelect.value;

  elements.poVendorSelect.innerHTML = vendorOptions;
  elements.vendorAlertVendorSelect.innerHTML = vendorOptions;

  if (previousPoVendor && state.vendors.some((vendor) => vendor.id === previousPoVendor)) {
    elements.poVendorSelect.value = previousPoVendor;
  } else {
    elements.poVendorSelect.value = state.vendors[0].id;
  }

  if (previousAlertVendor && state.vendors.some((vendor) => vendor.id === previousAlertVendor)) {
    elements.vendorAlertVendorSelect.value = previousAlertVendor;
  } else {
    elements.vendorAlertVendorSelect.value = state.vendors[0].id;
  }

  elements.poVendorSelect.disabled = !managerAccess;
  elements.vendorAlertVendorSelect.disabled = !managerAccess;

  prefillPoCostPriceFromVendor(false);
  renderVendorAlertPoOptions();
}

function renderVendorAlertPoOptions() {
  const vendorId = elements.vendorAlertVendorSelect.value;
  const previousPoSelection = elements.vendorAlertPoSelect.value;
  if (!vendorId) {
    elements.vendorAlertPoSelect.innerHTML = "<option value=\"\">No PO context</option>";
    return;
  }

  const vendorPos = state.purchaseOrders
    .filter((po) => po.vendorId === vendorId)
    .sort((a, b) => new Date(b.raisedAt || b.createdAt) - new Date(a.raisedAt || a.createdAt));

  const options = [
    "<option value=\"\">General Alert (No specific PO)</option>",
    ...vendorPos.map(
      (po) =>
        `<option value="${po.id}">${escapeHtml(po.poNumber)} · ${escapeHtml(po.goods)} (${escapeHtml(po.status)})</option>`
    )
  ];
  elements.vendorAlertPoSelect.innerHTML = options.join("");

  if (previousPoSelection && vendorPos.some((po) => po.id === previousPoSelection)) {
    elements.vendorAlertPoSelect.value = previousPoSelection;
  } else {
    elements.vendorAlertPoSelect.value = "";
  }
}

function prefillPoCostPriceFromVendor(force) {
  const vendor = getVendorById(elements.poVendorSelect.value);
  if (!vendor) {
    return;
  }

  if (force || !elements.poCostPrice.value) {
    elements.poCostPrice.value = String(Number(vendor.defaultCostPrice || 0).toFixed(2));
  }
}

function renderVendors() {
  if (!state.vendors.length) {
    elements.vendorList.innerHTML = "<div class=\"empty\">No vendors added yet.</div>";
    return;
  }

  elements.vendorList.innerHTML = state.vendors
    .map((vendor) => {
      const vendorPos = state.purchaseOrders.filter((po) => po.vendorId === vendor.id);
      const openPos = vendorPos.filter((po) => normalizeStatusClass(po.status) === "open").length;
      const totalValue = vendorPos.reduce(
        (sum, po) => sum + (Number(po.quantity) || 0) * (Number(po.costPrice) || 0),
        0
      );

      const goodsChips = vendor.goods
        .map((item) => `<span class="mini-chip">${escapeHtml(item)}</span>`)
        .join("");

      return `
        <div class="vendor-card">
          <div><strong>${escapeHtml(vendor.name)}</strong></div>
          <div class="meta">Contact: ${escapeHtml(vendor.contactEmail || "-")}</div>
          <div class="meta">Default Cost Price: ${formatMoney(vendor.defaultCostPrice)}</div>
          <div class="meta">POs Raised: ${vendorPos.length} | Open: ${openPos} | Total Value: ${formatMoney(totalValue)}</div>
          <div class="chip-row">${goodsChips || "<span class=\"mini-chip\">No goods listed</span>"}</div>
        </div>
      `;
    })
    .join("");
}

function renderPurchaseOrders() {
  if (!state.purchaseOrders.length) {
    elements.poList.innerHTML = "<div class=\"empty\">No purchase orders raised yet.</div>";
    return;
  }

  const sorted = [...state.purchaseOrders].sort(
    (a, b) => new Date(b.raisedAt || b.createdAt) - new Date(a.raisedAt || a.createdAt)
  );

  elements.poList.innerHTML = sorted
    .map((po) => {
      const vendor = getVendorById(po.vendorId);
      const statusClass = normalizeStatusClass(po.status);
      const total = (Number(po.quantity) || 0) * (Number(po.costPrice) || 0);
      return `
        <div class="po-card">
          <div><strong>${escapeHtml(po.poNumber)}</strong> · ${escapeHtml(vendor ? vendor.name : "Unknown Vendor")}</div>
          <div class="meta">Goods: ${escapeHtml(po.goods)} | Qty: ${escapeHtml(String(po.quantity))}</div>
          <div class="meta">Cost Price: ${formatMoney(po.costPrice)} | Total: ${formatMoney(total)}</div>
          <div class="meta">Raised: ${formatDate(po.raisedAt)} | Expected: ${po.expectedAt ? formatDate(po.expectedAt) : "-"}</div>
          <div class="chip-row">
            <span class="mini-chip ${statusClass}">${escapeHtml(po.status)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderVendorAlerts() {
  if (!state.vendorAlerts.length) {
    elements.vendorAlertList.innerHTML = "<div class=\"empty\">No vendor alerts sent yet.</div>";
    return;
  }

  const sorted = [...state.vendorAlerts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  elements.vendorAlertList.innerHTML = sorted
    .map((alertItem) => {
      const vendor = getVendorById(alertItem.vendorId);
      const po = alertItem.poId ? getPurchaseOrderById(alertItem.poId) : null;
      const priorityClass = String(alertItem.priority || "Medium").toLowerCase();
      return `
        <div class="alert-card">
          <div><strong>${escapeHtml(vendor ? vendor.name : "Unknown Vendor")}</strong></div>
          <div class="meta">PO Context: ${escapeHtml(po ? po.poNumber : "General Alert")}</div>
          <div class="meta">Sent By: ${escapeHtml(alertItem.sentBy || "-")} · ${formatDateTime(alertItem.createdAt)}</div>
          <div class="chip-row">
            <span class="mini-chip ${priorityClass}">${escapeHtml(alertItem.priority || "Medium")}</span>
          </div>
          <div class="meta">${escapeHtml(alertItem.message)}</div>
        </div>
      `;
    })
    .join("");
}

function renderCalendar() {
  const monthDate = getCalendarMonthDate();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const label = monthDate.toLocaleString(undefined, { month: "long", year: "numeric" });
  elements.calendarMonthLabel.textContent = label;
  elements.calendarGrid.innerHTML = "";

  for (const dayName of WEEK_DAYS) {
    const weekday = document.createElement("div");
    weekday.className = "weekday-cell";
    weekday.textContent = dayName;
    elements.calendarGrid.appendChild(weekday);
  }

  const taskByDate = buildTaskDateMap();
  const leadingBlanks = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  for (let i = leadingBlanks - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    const date = new Date(year, month - 1, day);
    elements.calendarGrid.appendChild(buildDayCell(date, taskByDate, true));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    elements.calendarGrid.appendChild(buildDayCell(date, taskByDate, false));
  }

  const totalCells = elements.calendarGrid.children.length - WEEK_DAYS.length;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let day = 1; day <= remaining; day += 1) {
    const date = new Date(year, month + 1, day);
    elements.calendarGrid.appendChild(buildDayCell(date, taskByDate, true));
  }

  renderCalendarDayDetails(taskByDate);
}

function buildDayCell(date, taskByDate, isOutside) {
  const key = toDateKey(date);
  const tasks = taskByDate.get(key) || [];
  const isToday = key === todayDateKey();
  const isSelected = key === state.settings.calendarSelectedDate;

  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = `day-cell${isOutside ? " outside" : ""}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`;
  cell.dataset.date = key;

  const number = document.createElement("div");
  number.className = "day-number";
  number.textContent = String(date.getDate());
  cell.appendChild(number);

  const visibleTasks = tasks.slice(0, 3);
  for (const task of visibleTasks) {
    const chip = document.createElement("span");
    const urgencyClass = task.status === "Completed" ? "completed" : task.urgency.toLowerCase();
    chip.className = `calendar-chip ${urgencyClass}`;
    chip.textContent = task.title;
    cell.appendChild(chip);
  }

  if (tasks.length > 3) {
    const more = document.createElement("span");
    more.className = "calendar-chip completed";
    more.textContent = `+${tasks.length - 3} more`;
    cell.appendChild(more);
  }

  return cell;
}

function renderCalendarDayDetails(taskByDate) {
  const selectedDate = state.settings.calendarSelectedDate || todayDateKey();
  const tasks = (taskByDate.get(selectedDate) || []).sort(compareTasksForPriority);

  if (!tasks.length) {
    elements.calendarDayDetails.innerHTML = `
      <strong>${escapeHtml(selectedDate)}</strong>
      <div class="empty">No tasks due on this date.</div>
    `;
    return;
  }

  const rows = tasks
    .map((task) => {
      const employee = getEmployeeById(task.assigneeId);
      const attachments = Array.isArray(task.attachments) ? task.attachments.length : 0;
      return `
        <div class="task-card ${task.status === "Completed" ? "completed" : task.urgency.toLowerCase()}">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="meta">Employee: ${escapeHtml(employee ? employee.name : "Unknown")}</div>
          <div class="meta">Urgency: ${escapeHtml(task.urgency)} | Status: ${escapeHtml(task.status)}</div>
          <div class="meta">Due at: ${formatDateTime(task.dueAt)}</div>
          <div class="meta">Attachments: ${attachments}</div>
        </div>
      `;
    })
    .join("");

  elements.calendarDayDetails.innerHTML = `
    <strong>${escapeHtml(selectedDate)}</strong>
    <div class="stack">${rows}</div>
  `;
}


function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getEmployeeById(employeeId) {
  return state.employees.find((employee) => employee.id === employeeId);
}

function getVendorById(vendorId) {
  return state.vendors.find((vendor) => vendor.id === vendorId);
}

function getPurchaseOrderById(poId) {
  return state.purchaseOrders.find((po) => po.id === poId);
}

function getMessagesByEmployee(employeeId) {
  return state.messages
    .filter((message) => message.employeeId === employeeId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function buildTaskDateMap() {
  const taskByDate = new Map();
  for (const task of state.tasks) {
    const key = toDateKey(new Date(task.dueAt));
    if (!taskByDate.has(key)) {
      taskByDate.set(key, []);
    }
    taskByDate.get(key).push(task);
  }

  for (const list of taskByDate.values()) {
    list.sort(compareTasksForPriority);
  }

  return taskByDate;
}

function compareTasksForPriority(a, b) {
  if (a.status !== b.status) {
    return a.status === "Pending" ? -1 : 1;
  }
  const urgencyDelta = (URGENCY_WEIGHT[b.urgency] || 0) - (URGENCY_WEIGHT[a.urgency] || 0);
  if (urgencyDelta !== 0) {
    return urgencyDelta;
  }
  return new Date(a.dueAt) - new Date(b.dueAt);
}

function getCalendarMonthDate() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(state.settings.calendarMonthOffset || 0));
  return date;
}

function buildWhatsAppUrl(employee, task, note) {
  const phone = normalizePhone(employee.phone);
  if (!phone) {
    return null;
  }

  const lines = [
    `Hello ${employee.name},`,
    `Task: ${task.title}`,
    `Urgency: ${task.urgency.toUpperCase()}`,
    `Due: ${formatDateTime(task.dueAt)}`,
    note,
    "Please update progress in the Task Assignment app."
  ];

  const text = encodeURIComponent(lines.filter(Boolean).join("\n"));
  return `https://wa.me/${phone}?text=${text}`;
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseGoodsList(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneDefaultState();
    }
    const parsed = JSON.parse(raw);
    return {
      session: parsed.session || null,
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      vendors: Array.isArray(parsed.vendors) ? parsed.vendors : [],
      purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : [],
      vendorAlerts: Array.isArray(parsed.vendorAlerts) ? parsed.vendorAlerts : [],
      settings: {
        ...cloneDefaultState().settings,
        ...(parsed.settings || {})
      }
    };
  } catch (error) {
    console.error("Failed to load state:", error);
    return cloneDefaultState();
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "₹0.00";
  }
  return `₹${number.toFixed(2)}`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateKey() {
  return toDateKey(new Date());
}

function toDatetimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function truncateText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1)}…`;
}

function renderTaskAttachments(task) {
  const attachments = Array.isArray(task.attachments)
    ? task.attachments.filter((attachment) => attachment && attachment.dataUrl)
    : [];

  if (!attachments.length) {
    return "";
  }

  const links = attachments
    .map(
      (attachment) =>
        `<a href="${escapeHtml(attachment.dataUrl)}" download="${escapeHtml(attachment.name || "attachment")}">${escapeHtml(attachment.name || "attachment")}</a>`
    )
    .join("");

  return `
    <div class="attachments">
      <div class="meta">Attachments (${attachments.length})</div>
      <div class="attachment-links">${links}</div>
    </div>
  `;
}

function normalizeStatusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("cancel")) {
    return "cancelled";
  }
  if (value.includes("delay")) {
    return "delayed";
  }
  if (value.includes("received") && !value.includes("partial")) {
    return "received";
  }
  return "open";
}

function slugify(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "user";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}