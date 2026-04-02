import { useState, useEffect, useCallback } from "react";
import "./App.css";

const DATA_KEY   = "ff_data_v3";
const VISIT_KEY  = "ff_first_visit";
const PAY_LINK   = "https://buy.stripe.com/REPLACE_WITH_YOUR_STRIPE_LINK";
const PRO_DAYS   = 30;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) { return "$" + Number(n).toLocaleString(); }
function nextInvNum(invoices) {
  const nums = invoices.map(i => parseInt((i.number || "INV-000").replace("INV-", "")) || 0);
  return "INV-" + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
}
function daysSince(ts) { return (Date.now() - Number(ts)) / 86400000; }

const EMPTY = { clients: [], invoices: [], taxRate: 25 };
const SL    = { paid: "Paid", sent: "Sent", overdue: "Overdue", draft: "Draft" };

function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{SL[status] || status}</span>;
}

function Modal({ onClose, children }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

function UpgradeModal({ onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="upgrade-modal">
        <div className="upgrade-emoji">⚡</div>
        <div className="upgrade-title">Upgrade to Pro</div>
        <div className="upgrade-sub">
          You've been using FreelanceFlow for 30 days.<br />
          Unlock the full product for $15/month.
        </div>
        <div className="upgrade-list">
          {[
            "Unlimited clients & invoices",
            "CSV export for your accountant",
            "Cloud backup — never lose data",
            "Invoice PDF download",
            "Priority support",
          ].map(f => (
            <div key={f} className="upgrade-item">
              <span className="upgrade-check">✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
        <a href={PAY_LINK} target="_blank" rel="noopener noreferrer" className="btn btn-purple" style={{ width: "100%", justifyContent: "center", fontSize: "15px", padding: "12px" }}>
          Get Pro — $15 / month
        </a>
        <button className="dismiss-btn" onClick={onClose}>Maybe later</button>
      </div>
    </Modal>
  );
}

export default function App() {
  const [d, setD]             = useState(null);
  const [tab, setTab]         = useState("dashboard");
  const [modal, setModal]     = useState(null);   // "invoice" | "client" | "upgrade"
  const [form, setForm]       = useState({});
  const [saved, setSaved]     = useState(false);
  const [filter, setFilter]   = useState("all");
  const [firstVisit, setFV]   = useState(null);

  // ── LOAD ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      setD(raw ? JSON.parse(raw) : { ...EMPTY });
    } catch { setD({ ...EMPTY }); }

    let fv = localStorage.getItem(VISIT_KEY);
    if (!fv) { fv = Date.now().toString(); localStorage.setItem(VISIT_KEY, fv); }
    setFV(fv);
  }, []);

  // ── PERSIST ──
  const persist = useCallback(next => {
    setD(next);
    try { localStorage.setItem(DATA_KEY, JSON.stringify(next)); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }, []);

  if (!d) return <div className="loading">Loading FreelanceFlow…</div>;

  // ── PRO CHECK ── only show after PRO_DAYS days
  const isProEligible = firstVisit && daysSince(firstVisit) >= PRO_DAYS;

  // ── STATS ──
  const paid        = d.invoices.filter(i => i.status === "paid");
  const totalEarned = paid.reduce((s, i) => s + i.amount, 0);
  const outstanding = d.invoices.filter(i => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const overdueAmt  = d.invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const taxOwed     = Math.round(totalEarned * d.taxRate / 100);
  const netIncome   = totalEarned - taxOwed;
  const thisMonth   = new Date().toISOString().slice(0, 7);
  const monthEarned = paid.filter(i => (i.date || "").startsWith(thisMonth)).reduce((s, i) => s + i.amount, 0);

  // ── ACTIONS ──
  function addInvoice() {
    if (!form.clientId || !form.desc || !form.amount || !form.due) return;
    const client = d.clients.find(c => c.id === form.clientId);
    if (!client) return;
    const inv = {
      id: uid(),
      number: nextInvNum(d.invoices),
      clientId: form.clientId,
      clientName: client.name,
      desc: form.desc,
      amount: Number(form.amount),
      due: form.due,
      status: "draft",
      date: new Date().toISOString().slice(0, 10),
    };
    persist({ ...d, invoices: [inv, ...d.invoices] });
    setModal(null); setForm({});
  }

  function addClient() {
    if (!form.name) return;
    persist({ ...d, clients: [...d.clients, { id: uid(), name: form.name, email: form.email || "", company: form.company || form.name }] });
    setModal(null); setForm({});
  }

  function updateStatus(id, status) {
    persist({ ...d, invoices: d.invoices.map(i => i.id === id ? { ...i, status } : i) });
  }

  function deleteInvoice(id) { persist({ ...d, invoices: d.invoices.filter(i => i.id !== id) }); }
  function deleteClient(id)  { persist({ ...d, clients: d.clients.filter(c => c.id !== id) }); }

  function exportCSV() {
    const rows = [["Number", "Client", "Description", "Amount", "Due", "Status", "Created"]];
    d.invoices.forEach(i => rows.push([i.number, i.clientName, i.desc, i.amount, i.due, SL[i.status], i.date]));
    const csv  = rows.map(r => r.map(c => `"${c || ""}"`).join(",")).join("\n");
    const url  = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "freelanceflow.csv" }).click();
    URL.revokeObjectURL(url);
  }

  const filteredInvoices = filter === "all" ? d.invoices : d.invoices.filter(i => i.status === filter);
  const isNewUser = d.clients.length === 0 && d.invoices.length === 0;

  const PAGES = {
    dashboard: "Dashboard",
    invoices:  "Invoices",
    clients:   "Clients",
    tax:       "Tax Estimate",
  };

  // ── MONTHLY DATA ──
  const monthlyData = (() => {
    const map = {};
    paid.forEach(i => { const m = (i.date || "").slice(0, 7); if (m) map[m] = (map[m] || 0) + i.amount; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({
      label: new Date(m + "-01").toLocaleDateString("en", { month: "short", year: "numeric" }),
      amount: v,
    }));
  })();

  return (
    <div className="shell">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🌊</div>
          <div>
            <div className="brand-name">FreelanceFlow</div>
            <div className="brand-plan">FREE PLAN</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {Object.entries(PAGES).map(([key, label]) => (
            <button key={key} className={`nav-item ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              <span className="nav-icon">{{ dashboard: "📊", invoices: "🧾", clients: "👤", tax: "📋" }[key]}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {isProEligible
            ? <button className="btn btn-purple btn-sm" style={{ width: "100%" }} onClick={() => setModal("upgrade")}>⚡ Upgrade to Pro</button>
            : <span>Your data is saved locally</span>
          }
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{PAGES[tab]}</div>
          <div className="topbar-actions">
            {saved && <span className="saved">✓ Saved</span>}
            {tab === "invoices" && isProEligible && (
              <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ Export CSV</button>
            )}
            {tab !== "tax" && (
              <button className="btn btn-primary" onClick={() => { setModal(tab === "clients" ? "client" : "invoice"); setForm({}); }}>
                {tab === "clients" ? "+ Add client" : "+ New invoice"}
              </button>
            )}
          </div>
        </header>

        <div className="page">

          {/* ── ONBOARDING ── */}
          {isNewUser && tab === "dashboard" && (
            <div className="onboarding">
              <div className="onboarding-icon">🌊</div>
              <h1>Welcome to FreelanceFlow</h1>
              <p>Your personal income tracker. Set up in 2 minutes — no account needed, data stays on your device.</p>
              <div className="onboarding-steps">
                {[
                  ["1", "Add your first client", "The company or person you work for"],
                  ["2", "Create an invoice", "Log what you've delivered and the amount"],
                  ["3", "Mark it paid when money arrives", "Watch your dashboard update in real time"],
                ].map(([n, title, sub]) => (
                  <div key={n} className="onboarding-step">
                    <div className="step-num">{n}</div>
                    <div className="step-text"><strong>{title}</strong><span>{sub}</span></div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ fontSize: "15px", padding: "12px 28px" }} onClick={() => { setModal("client"); setForm({}); }}>
                Add your first client →
              </button>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && !isNewUser && (
            <>
              <div className="metrics-row">
                {[
                  { label: "Total earned",  val: fmt(totalEarned), sub: `${paid.length} paid invoice${paid.length !== 1 ? "s" : ""}`, cls: "c-green" },
                  { label: "Outstanding",   val: fmt(outstanding),  sub: `${d.invoices.filter(i => i.status === "sent" || i.status === "overdue").length} awaiting payment`, cls: "c-amber" },
                  { label: "Overdue",       val: fmt(overdueAmt),   sub: `${d.invoices.filter(i => i.status === "overdue").length} past due date`, cls: "c-red" },
                  { label: "Tax set aside", val: fmt(taxOwed),      sub: `${d.taxRate}% of income`, cls: "c-muted" },
                ].map(m => (
                  <div key={m.label} className="metric">
                    <div className="metric-label">{m.label}</div>
                    <div className={`metric-val ${m.cls}`}>{m.val}</div>
                    <div className="metric-sub">{m.sub}</div>
                  </div>
                ))}
              </div>

              <div className="net-card">
                <div>
                  <div className="label">Net take-home after tax</div>
                  <div className="val">{fmt(netIncome)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label">This month</div>
                  <div className="val-sm">{fmt(monthEarned)}</div>
                </div>
              </div>

              <div className="section-hd">
                <h2>Recent invoices</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setTab("invoices")}>View all</button>
              </div>

              <div className="table-wrap">
                {d.invoices.length === 0
                  ? <div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">No invoices yet</div><div className="empty-sub">Create your first invoice to track your work.</div><button className="btn btn-primary" onClick={() => { setModal("invoice"); setForm({}); }}>+ New invoice</button></div>
                  : <table>
                      <thead><tr><th>Invoice</th><th>Client</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>
                      <tbody>
                        {d.invoices.slice(0, 8).map(inv => (
                          <tr key={inv.id}>
                            <td><span className="inv-num">{inv.number || "—"}</span></td>
                            <td className="td-main">{inv.clientName}</td>
                            <td>{inv.desc}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(inv.amount)}</td>
                            <td style={{ color: "var(--text-3)" }}>{inv.due}</td>
                            <td><Badge status={inv.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </div>
            </>
          )}

          {/* ── INVOICES ── */}
          {tab === "invoices" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div className="filter-row">
                  {["all", "draft", "sent", "overdue", "paid"].map(s => (
                    <button key={s} className={`filter-btn ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
                      {s === "all" ? "All" : SL[s]}
                    </button>
                  ))}
                  <span className="filter-count">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}</span>
                </div>
              </div>

              <div className="table-wrap">
                {filteredInvoices.length === 0
                  ? <div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">No {filter !== "all" ? filter + " " : ""}invoices</div>{filter === "all" && <><div className="empty-sub">Create your first invoice to get started.</div><button className="btn btn-primary" onClick={() => { setModal("invoice"); setForm({}); }}>+ New invoice</button></>}</div>
                  : <table>
                      <thead><tr><th>#</th><th>Client</th><th>Description</th><th>Amount</th><th>Due date</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {filteredInvoices.map(inv => (
                          <tr key={inv.id}>
                            <td><span className="inv-num">{inv.number || "—"}</span></td>
                            <td><div className="td-main">{inv.clientName}</div><div className="td-sub">Created {inv.date}</div></td>
                            <td>{inv.desc}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(inv.amount)}</td>
                            <td style={{ color: "var(--text-3)" }}>{inv.due}</td>
                            <td>
                              <select className="status-select" value={inv.status} onChange={e => updateStatus(inv.id, e.target.value)}>
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                                <option value="paid">Paid ✓</option>
                                <option value="overdue">Overdue</option>
                              </select>
                            </td>
                            <td><button className="btn btn-danger" onClick={() => deleteInvoice(inv.id)}>Delete</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </div>
              {filteredInvoices.length > 0 && (
                <div style={{ textAlign: "right", marginTop: "10px", fontSize: "13px", color: "var(--text-3)" }}>
                  Total shown: <strong style={{ color: "var(--text)" }}>{fmt(filteredInvoices.reduce((s, i) => s + i.amount, 0))}</strong>
                </div>
              )}
            </>
          )}

          {/* ── CLIENTS ── */}
          {tab === "clients" && (
            <>
              {d.clients.length === 0
                ? <div className="empty" style={{ paddingTop: "80px" }}>
                    <div className="empty-icon">👤</div>
                    <div className="empty-title">No clients yet</div>
                    <div className="empty-sub">Add your first client to start creating invoices for them.</div>
                    <button className="btn btn-primary" onClick={() => { setModal("client"); setForm({}); }}>+ Add first client</button>
                  </div>
                : <div className="client-grid">
                    {d.clients.map(c => {
                      const cli   = d.invoices.filter(i => i.clientId === c.id);
                      const cPaid = cli.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
                      const cOwed = cli.filter(i => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);
                      return (
                        <div key={c.id} className="client-card">
                          <div className="client-head">
                            <div className="avatar">{c.name.slice(0, 2).toUpperCase()}</div>
                            <div>
                              <div className="client-name">{c.name}</div>
                              <div className="client-email">{c.email || "No email"}</div>
                            </div>
                          </div>
                          <div className="client-stats">
                            <span>{cli.length} invoice{cli.length !== 1 ? "s" : ""}</span>
                            <span style={{ color: "var(--green)", fontWeight: 600 }}>{fmt(cPaid)} paid</span>
                          </div>
                          {cOwed > 0 && <div style={{ fontSize: "12px", color: "var(--amber)", textAlign: "right" }}>{fmt(cOwed)} outstanding</div>}
                          <button className="btn btn-danger" style={{ width: "100%", marginTop: "4px" }} onClick={() => deleteClient(c.id)}>Remove client</button>
                        </div>
                      );
                    })}
                    <div className="card client-add-card" onClick={() => { setModal("client"); setForm({}); }}>
                      <div className="client-add-icon">+</div>
                      <span style={{ fontSize: "13px" }}>Add client</span>
                    </div>
                  </div>
              }
            </>
          )}

          {/* ── TAX ── */}
          {tab === "tax" && (
            <>
              <div className="card card-p" style={{ marginBottom: "20px" }}>
                <h2 style={{ marginBottom: "4px", fontSize: "14px" }}>Estimated tax rate</h2>
                <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "8px" }}>Drag to set your combined self-employment + income tax rate</p>
                <div className="slider-wrap">
                  <input type="range" min="10" max="50" step="1" className="slider" value={d.taxRate}
                    onChange={e => persist({ ...d, taxRate: Number(e.target.value) })} />
                  <span className="slider-val">{d.taxRate}%</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-3)" }}>Most freelancers: 20–30% · Higher earners: 30–40%</p>
              </div>

              <div className="tax-grid">
                {[
                  { label: "Gross income",       val: fmt(totalEarned), note: "Sum of paid invoices", cls: "" },
                  { label: "Tax to set aside",   val: fmt(taxOwed),     note: `${d.taxRate}% of gross`, cls: "c-red" },
                  { label: "Net take-home",      val: fmt(netIncome),   note: "After estimated tax", cls: "c-green" },
                  { label: "Quarterly payment",  val: fmt(Math.round(taxOwed / 4)), note: "Pay 4× a year", cls: "c-amber" },
                ].map(m => (
                  <div key={m.label} className="metric">
                    <div className="metric-label">{m.label}</div>
                    <div className={`metric-val ${m.cls}`} style={{ fontSize: "22px" }}>{m.val}</div>
                    <div className="metric-sub">{m.note}</div>
                  </div>
                ))}
              </div>

              {monthlyData.length > 0 && (
                <div className="card card-p" style={{ marginTop: "20px" }}>
                  <div className="section-hd"><h2>Monthly breakdown</h2></div>
                  {monthlyData.map(m => (
                    <div key={m.label} className="tax-row">
                      <span style={{ color: "var(--text-2)" }}>{m.label}</span>
                      <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="c-green" style={{ fontWeight: 600, fontSize: "13px" }}>{fmt(m.amount)}</span>
                        <span className="c-red" style={{ fontSize: "12px" }}>−{fmt(Math.round(m.amount * d.taxRate / 100))} tax</span>
                        <span style={{ fontWeight: 600, fontSize: "13px" }}>{fmt(m.amount - Math.round(m.amount * d.taxRate / 100))} net</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>{/* end .page */}
      </div>{/* end .main */}

      {/* ── UPGRADE MODAL ── */}
      {modal === "upgrade" && <UpgradeModal onClose={() => setModal(null)} />}

      {/* ── INVOICE MODAL ── */}
      {modal === "invoice" && (
        <Modal onClose={() => { setModal(null); setForm({}); }}>
          <div className="modal-title">New invoice</div>
          {d.clients.length === 0
            ? <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>👤</div>
                <p style={{ color: "var(--text-2)", marginBottom: "16px" }}>Add a client first before creating an invoice.</p>
                <button className="btn btn-primary" onClick={() => { setModal("client"); setForm({}); }}>Add a client first</button>
              </div>
            : <>
                <div className="field">
                  <label>Client</label>
                  <select className="input" value={form.clientId || ""} onChange={e => setForm({ ...form, clientId: e.target.value })}>
                    <option value="">Select client…</option>
                    {d.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {[
                  { label: "Description", field: "desc",   type: "text",   placeholder: "What did you deliver?" },
                  { label: "Amount (USD)", field: "amount", type: "number", placeholder: "0" },
                  { label: "Due date",     field: "due",    type: "date" },
                ].map(f => (
                  <div key={f.field} className="field">
                    <label>{f.label}</label>
                    <input className="input" type={f.type} placeholder={f.placeholder || ""} value={form[f.field] || ""}
                      onChange={e => setForm({ ...form, [f.field]: e.target.value })} />
                  </div>
                ))}
                {form.amount && Number(form.amount) > 0 && (
                  <div className="tax-hint">
                    Tax ({d.taxRate}%): <strong style={{ color: "var(--red)" }}>{fmt(Math.round(Number(form.amount) * d.taxRate / 100))}</strong>
                    &ensp;·&ensp;You keep: <strong>{fmt(Math.round(Number(form.amount) * (1 - d.taxRate / 100)))}</strong>
                  </div>
                )}
                <div className="modal-footer">
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={addInvoice}>Create invoice</button>
                  <button className="btn btn-ghost" onClick={() => { setModal(null); setForm({}); }}>Cancel</button>
                </div>
              </>
          }
        </Modal>
      )}

      {/* ── CLIENT MODAL ── */}
      {modal === "client" && (
        <Modal onClose={() => { setModal(null); setForm({}); }}>
          <div className="modal-title">Add client</div>
          {[
            { label: "Name *",   field: "name",    placeholder: "Client or company name" },
            { label: "Email",    field: "email",   placeholder: "billing@client.com" },
            { label: "Company",  field: "company", placeholder: "Company name (optional)" },
          ].map(f => (
            <div key={f.field} className="field">
              <label>{f.label}</label>
              <input className="input" placeholder={f.placeholder} value={form[f.field] || ""}
                onChange={e => setForm({ ...form, [f.field]: e.target.value })} />
            </div>
          ))}
          <div className="modal-footer">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={addClient}>Add client</button>
            <button className="btn btn-ghost" onClick={() => { setModal(null); setForm({}); }}>Cancel</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
