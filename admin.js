import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm";

const config = window.ETHIXWEB_CONFIG || {};
const loginPanel = document.getElementById("admin-login-panel");
const configNotice = document.getElementById("admin-config-notice");
const app = document.getElementById("admin-app");
const loginStatus = document.getElementById("admin-login-status");
const feedback = document.getElementById("admin-feedback");
const leadsBody = document.getElementById("leads-body");
const pageSize = 20;
let supabase;
let page = 0;
let total = 0;

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  configNotice.hidden = false;
} else {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  await start().catch(function (error) {
    console.error("Admin initialization failed:", error);
    showLogin("Could not connect to admin services. Please try again later.", true);
  });
}

async function start() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    showLogin("We could not check the sign-in session. Please try signing in again.", true);
    return;
  }
  if (!sessionData.session) {
    showLogin("", false);
    return;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    showLogin("We could not verify the sign-in session. Please try signing in again.", true);
    return;
  }
  if (!data.user) {
    showLogin("", false);
    return;
  }

  const { data: adminRecord, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError) {
    console.error("Admin allowlist check failed:", adminError.message);
    showLogin("We could not verify admin access. Check the database setup and try again.", true);
    return;
  }
  if (!adminRecord) {
    showLogin("This signed-in account is not authorized for the admin dashboard.", true);
    return;
  }

  loginPanel.hidden = true;
  app.hidden = false;
  document.getElementById("admin-user").textContent = "Signed in as " + data.user.email;
  await loadDashboard();
}

function showLogin(message, isError) {
  loginPanel.hidden = false;
  app.hidden = true;
  if (message) {
    loginStatus.textContent = message;
    loginStatus.classList.toggle("error", isError);
    loginStatus.hidden = false;
  }
}

document.getElementById("admin-login-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  loginStatus.hidden = true;
  const button = this.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Signing in…";
  const email = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showLogin("Sign-in failed. Check your credentials or ask an administrator for access.", true);
      return;
    }
    await start();
  } catch (error) {
    console.error("Admin sign-in failed:", error);
    showLogin("Could not connect to admin services. Please try again later.", true);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Sign in <span>↗</span>';
  }
});

document.getElementById("admin-sign-out").addEventListener("click", async function () {
  this.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      feedback.textContent = "Could not sign out. Please try again.";
      return;
    }
    showLogin("", false);
  } catch (error) {
    console.error("Admin sign-out failed:", error);
    feedback.textContent = "Could not sign out. Please try again.";
  } finally {
    this.disabled = false;
  }
});

document.getElementById("admin-set-password").addEventListener("click", function () {
  const form = document.getElementById("admin-password-form");
  form.hidden = !form.hidden;
  if (!form.hidden) document.getElementById("admin-new-password").focus();
});

document.getElementById("admin-password-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  const password = document.getElementById("admin-new-password").value;
  const confirmation = document.getElementById("admin-confirm-password").value;
  const passwordStatus = document.getElementById("admin-password-status");
  passwordStatus.hidden = false;
  passwordStatus.classList.remove("error");

  if (password.length < 12) {
    passwordStatus.textContent = "Choose a password with at least 12 characters.";
    passwordStatus.classList.add("error");
    return;
  }
  if (password !== confirmation) {
    passwordStatus.textContent = "The passwords do not match.";
    passwordStatus.classList.add("error");
    return;
  }

  const button = this.querySelector('button[type="submit"]');
  button.disabled = true;
  passwordStatus.textContent = "Updating password…";
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      passwordStatus.textContent = "Could not update the password. Please try again.";
      passwordStatus.classList.add("error");
      return;
    }
    this.reset();
    passwordStatus.textContent = "Password updated. Keep it private.";
  } catch (error) {
    console.error("Admin password update failed:", error);
    passwordStatus.textContent = "Could not connect to admin services. Please try again.";
    passwordStatus.classList.add("error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("lead-filter").addEventListener("submit", async function (event) {
  event.preventDefault();
  page = 0;
  await loadDashboard();
});

document.getElementById("previous-page").addEventListener("click", async function () {
  if (page > 0) {
    page -= 1;
    await loadDashboard();
  }
});

document.getElementById("next-page").addEventListener("click", async function () {
  if ((page + 1) * pageSize < total) {
    page += 1;
    await loadDashboard();
  }
});

async function loadDashboard() {
  try {
    feedback.textContent = "Loading enquiries…";
    const statuses = ["new", "contacted", "qualified", "closed"];
    const countResults = await Promise.all(statuses.map((status) =>
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", status)
    ));
    if (countResults.some((result) => result.error)) {
      feedback.textContent = "Could not load enquiry counts. Check the database setup and RLS policies.";
      return;
    }
    document.getElementById("status-counts").replaceChildren(...countResults.map((result, index) => {
      const card = document.createElement("div");
      card.className = "status-count";
      const count = document.createElement("strong");
      count.textContent = String(result.count || 0);
      const label = document.createElement("span");
      label.textContent = statuses[index][0].toUpperCase() + statuses[index].slice(1);
      card.append(count, label);
      return card;
    }));

    const search = document.getElementById("lead-search").value.trim().replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").slice(0, 80);
    const service = document.getElementById("lead-service-filter").value;
    const status = document.getElementById("lead-status-filter").value;
    let query = supabase.from("leads")
      .select("id,name,email,service,status,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (search) query = query.or("name.ilike.%" + search + "%,email.ilike.%" + search + "%");
    if (service) query = query.eq("service", service);
    if (status) query = query.eq("status", status);
    const { data: leads, count, error } = await query;
    if (error) {
      feedback.textContent = "Could not load enquiries. Check the database setup and RLS policies.";
      leadsBody.replaceChildren();
      return;
    }
    total = count || 0;
    feedback.textContent = total ? total + (total === 1 ? " enquiry" : " enquiries") : "No enquiries match these filters.";
    leadsBody.replaceChildren(...(leads || []).map(renderLead));
    document.getElementById("page-display").textContent = "Page " + (page + 1) + " of " + Math.max(1, Math.ceil(total / pageSize));
    document.getElementById("previous-page").disabled = page === 0;
    document.getElementById("next-page").disabled = (page + 1) * pageSize >= total;
  } catch (error) {
    console.error("Admin dashboard request failed:", error);
    feedback.textContent = "Could not connect to the enquiry database. Please try again.";
  }
}

function renderLead(lead) {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  const detailLink = document.createElement("a");
  detailLink.href = "admin-lead.html?id=" + encodeURIComponent(lead.id);
  detailLink.className = "text-link";
  detailLink.textContent = lead.name;
  nameCell.appendChild(detailLink);

  const emailCell = document.createElement("td");
  const emailLink = document.createElement("a");
  emailLink.href = "mailto:" + encodeURIComponent(lead.email);
  emailLink.textContent = lead.email;
  emailCell.appendChild(emailLink);

  const serviceCell = document.createElement("td");
  serviceCell.textContent = lead.service;
  const statusCell = document.createElement("td");
  statusCell.appendChild(createStatusControl(lead));
  const dateCell = document.createElement("td");
  dateCell.textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(lead.created_at));
  row.append(nameCell, emailCell, serviceCell, statusCell, dateCell);
  return row;
}

function createStatusControl(lead) {
  const wrapper = document.createElement("div");
  const select = document.createElement("select");
  select.className = "status-select";
  select.setAttribute("aria-label", "Status for " + lead.name);
  ["new", "contacted", "qualified", "closed"].forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status[0].toUpperCase() + status.slice(1);
    select.appendChild(option);
  });
  select.value = lead.status;
  const save = document.createElement("button");
  save.className = "text-link status-save";
  save.type = "button";
  save.textContent = "Save";
  save.hidden = true;
  const message = document.createElement("span");
  message.className = "status-message";
  message.setAttribute("role", "status");
  select.addEventListener("change", () => { save.hidden = select.value === lead.status; message.textContent = ""; });
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const { error } = await supabase.from("leads").update({ status: select.value }).eq("id", lead.id);
      if (error) {
        message.textContent = "Failed";
        feedback.textContent = "Could not update enquiry status.";
        return;
      }
      lead.status = select.value;
      save.hidden = true;
      message.textContent = "Saved";
      await loadDashboard();
    } catch (error) {
      console.error("Lead status update failed:", error);
      message.textContent = "Failed";
      feedback.textContent = "Could not update enquiry status.";
    } finally {
      save.disabled = false;
    }
  });
  wrapper.append(select, save, message);
  return wrapper;
}
