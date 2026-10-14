import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm";

const config = window.ETHIXWEB_CONFIG || {};
const status = document.getElementById("lead-status");
const content = document.getElementById("lead-content");

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  status.textContent = "Admin is not configured yet. See the project README.";
} else {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    status.textContent = "We could not check the sign-in session. Please try again.";
  } else if (!sessionData.session) {
    status.textContent = "Please sign in to the admin dashboard first.";
    status.insertAdjacentHTML("beforeend", ' <a class="text-link" href="admin.html">Sign in</a>');
  } else {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      status.textContent = "Please sign in to the admin dashboard first.";
    } else {
      const { data: admin, error: adminError } = await supabase.from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminError) {
        console.error("Admin allowlist check failed:", adminError.message);
        status.textContent = "We could not verify admin access. Please try again later.";
      } else if (!admin) {
        status.textContent = "This account is not authorized to view enquiries.";
      } else {
        await loadLead(supabase);
      }
    }
  }
}

async function loadLead(supabase) {
  try {
    await renderLead(supabase);
  } catch (error) {
    console.error("Admin enquiry detail request failed:", error);
    status.textContent = "Could not connect to the enquiry database. Please try again.";
  }
}

async function renderLead(supabase) {
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    status.textContent = "Invalid enquiry ID.";
    return;
  }
  const { data: lead, error } = await supabase.from("leads")
    .select("id,name,email,company,phone,service,budget,message,status,consent_at,created_at")
    .eq("id", id).maybeSingle();
  if (error || !lead) {
    status.textContent = "Could not find this enquiry.";
    return;
  }

  document.getElementById("lead-heading").textContent = lead.name;
  status.textContent = "Submitted " + new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.created_at));
  content.hidden = false;
  content.className = "lead-detail";

  const fields = [
    ["Email", lead.email, "mailto:" + lead.email],
    ["Phone", lead.phone, "tel:" + lead.phone],
    ["Company", lead.company || "Not provided"],
    ["Service", lead.service],
    ["Budget", lead.budget || "Not provided"],
    ["Consent recorded", lead.consent_at ? "Yes" : "No"]
  ];
  const grid = document.createElement("dl");
  grid.className = "route-metrics";
  fields.forEach(([label, value, href]) => {
    const item = document.createElement("div");
    item.className = "route-metric";
    const term = document.createElement("dt");
    term.textContent = label;
    const definition = document.createElement("dd");
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = value;
      definition.appendChild(link);
    } else {
      definition.textContent = value;
    }
    item.append(term, definition);
    grid.appendChild(item);
  });
  const statusItem = document.createElement("div");
  statusItem.className = "route-metric";
  const statusTerm = document.createElement("dt");
  statusTerm.textContent = "Status";
  const statusDefinition = document.createElement("dd");
  const select = document.createElement("select");
  select.className = "status-select";
  select.setAttribute("aria-label", "Enquiry status");
  ["new", "contacted", "qualified", "closed"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    select.appendChild(option);
  });
  select.value = lead.status;
  const save = document.createElement("button");
  save.className = "text-link status-save";
  save.type = "button";
  save.textContent = "Save";
  save.hidden = true;
  select.addEventListener("change", () => { save.hidden = select.value === lead.status; });
  save.addEventListener("click", async () => {
    save.disabled = true;
    const { error: updateError } = await supabase.from("leads").update({ status: select.value }).eq("id", lead.id);
    save.disabled = false;
    if (updateError) {
      status.textContent = "Could not update this enquiry. Please try again.";
      return;
    }
    lead.status = select.value;
    save.hidden = true;
    status.textContent = "Status saved.";
  });
  statusDefinition.append(select, save);
  statusItem.append(statusTerm, statusDefinition);
  grid.appendChild(statusItem);
  content.appendChild(grid);

  const message = document.createElement("article");
  message.className = "route-block";
  const heading = document.createElement("h2");
  heading.textContent = "Project description";
  const text = document.createElement("p");
  text.textContent = lead.message;
  message.append(heading, text);
  content.appendChild(message);
}
