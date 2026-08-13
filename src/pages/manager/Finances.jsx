import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, fullName } from '../../lib/format.js'
import { downloadExcel } from '../../lib/excel.js'
import { Input, Select, Textarea } from '../../components/Field.jsx'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconWallet, IconClock, IconChart, IconPlus, IconTrash, IconReceipt, IconArrowRight, IconBuilding } from '../../components/icons.jsx'

const EXPENSE_CATEGORIES = ['Maintenance', 'Salaries', 'Refund', 'Utilities', 'Rates', 'Insurance', 'Security', 'Cleaning', 'Repairs', 'Other']

function exportFinances(rows, unassignedExp, periodLabel) {
  const data = rows.map((r) => ({ name: r.prop.name, collected: r.collected, expenses: r.expenses, net: r.net }))
  if (unassignedExp > 0) data.push({ name: 'General (no property)', collected: 0, expenses: unassignedExp, net: -unassignedExp })
  downloadExcel(`rentflow-finances-${new Date().toISOString().slice(0, 10)}`, data, [
    { header: 'Property', value: (r) => r.name },
    { header: 'Collected', value: (r) => r.collected.toFixed(2), numeric: true },
    { header: 'Expenses', value: (r) => r.expenses.toFixed(2), numeric: true },
    { header: 'Net', value: (r) => r.net.toFixed(2), numeric: true },
  ], { sheet: 'P&L', title: `RentLoja — Finances (${periodLabel})` })
}

const PERIODS = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
  { id: 'all', label: 'All time' },
]

function rangeFor(id) {
  const now = new Date()
  if (id === 'this_month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
  if (id === 'last_month') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) }
  if (id === 'this_year') return { from: new Date(now.getFullYear(), 0, 1), to: null }
  return { from: null, to: null }
}
const inRange = (dateStr, { from, to }) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (from && d < from) return false
  if (to && d >= to) return false
  return true
}

export default function Finances() {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [properties, setProperties] = useState([])
  const [tenants, setTenants] = useState([])
  const [period, setPeriod] = useState('this_month')
  const [adding, setAdding] = useState(false)
  const [drill, setDrill] = useState(null) // selected property row for breakdown
  const [card, setCard] = useState(null)   // 'collected' | 'expenses' | 'net' summary breakdown

  const load = useCallback(async () => {
    const [p, e, pr, t] = await Promise.all([
      db.listPayments(userId, { status: 'approved' }), db.listExpenses(userId), db.listProperties(userId), db.listTenants(userId),
    ])
    setPayments(p); setExpenses(e); setProperties(pr); setTenants(t); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const range = rangeFor(period)
  const propOfTenant = (tid) => tenants.find((t) => t.id === tid)?.property_id || null

  // Per-property collected / expenses / net within the period.
  const rows = properties.map((prop) => {
    const collected = payments
      .filter((p) => inRange(p.approved_at || p.paid_date, range) && propOfTenant(p.tenant_id) === prop.id)
      .reduce((s, p) => s + Number(p.amount), 0)
    const exp = expenses
      .filter((e) => e.property_id === prop.id && inRange(e.spent_on, range))
      .reduce((s, e) => s + Number(e.amount), 0)
    return { prop, collected, expenses: exp, net: collected - exp }
  })
  const unassignedExp = expenses.filter((e) => !e.property_id && inRange(e.spent_on, range)).reduce((s, e) => s + Number(e.amount), 0)

  const totalCollected = rows.reduce((s, r) => s + r.collected, 0)
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0) + unassignedExp
  const net = totalCollected - totalExpenses
  const periodLabel = PERIODS.find((p) => p.id === period)?.label
  const shownExpenses = expenses.filter((e) => inRange(e.spent_on, range))
  const collectedShown = payments.filter((p) => inRange(p.approved_at || p.paid_date, range))
  const propName = (id) => properties.find((p) => p.id === id)?.name || 'General'

  return (
    <div className="page" id="statement">
      <div className="page-head">
        <div className="eyebrow">Finances</div>
        <h1>Statements</h1>
        <p>Rent collected against expenses, per property — your bottom line.</p>
      </div>

      {/* One toolbar line: period picker + actions together (Executive). */}
      <div className="spread wrap no-print" style={{ gap: 10, marginBottom: 18 }}>
        <div className="seg">
          {PERIODS.map((p) => <button key={p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
        </div>
        <div className="row gap wrap">
          <button className="btn ghost sm" onClick={() => exportFinances(rows, unassignedExp, periodLabel)}><IconReceipt size={14} /> Excel</button>
          <button className="btn ghost sm" onClick={() => window.print()}><IconReceipt size={14} /> Print</button>
          <button className="btn primary sm" onClick={() => setAdding(true)}><IconPlus size={15} /> Add expense</button>
        </div>
      </div>

      {/* Compact KPI strip — three cells side by side at every width, exactly
          like the chosen mockup. Tap a cell for its breakdown. */}
      <div className="fin-kpis" style={{ marginBottom: 18 }}>
        <button type="button" onClick={() => setCard('collected')}>
          <span className="fk-l">Collected</span>
          <span className="fk-v" style={{ color: totalCollected > 0 ? 'var(--green)' : 'var(--text)' }}>{money(totalCollected)}</span>
        </button>
        <button type="button" onClick={() => setCard('expenses')}>
          <span className="fk-l">Expenses</span>
          <span className="fk-v" style={{ color: totalExpenses > 0 ? 'var(--danger)' : 'var(--text)' }}>{totalExpenses > 0 ? `−${money(totalExpenses)}` : money(0)}</span>
        </button>
        <button type="button" onClick={() => setCard('net')}>
          <span className="fk-l">Net</span>
          <span className="fk-v" style={{ color: net >= 0 ? 'var(--green)' : 'var(--danger)' }}>{money(net)}</span>
        </button>
      </div>

      {/* Per-property ledger rows with ⋯ — tap a row for the breakdown. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread" style={{ padding: '14px 16px 10px' }}>
          <h3 style={{ fontSize: '1.05rem' }}>Per property · {periodLabel}</h3>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        {rows.map((r) => (
          <div key={r.prop.id} className="fin-row" role="button" tabIndex={0}
            onClick={() => setDrill(r.prop)}
            onKeyDown={(e) => { if (e.key === 'Enter') setDrill(r.prop) }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{r.prop.name}</span>
              <div className="muted fin-sub">collected {money(r.collected)}{r.expenses > 0 ? ` · expenses −${money(r.expenses)}` : ''}</div>
            </div>
            <span className="mono" style={{ fontWeight: 700, whiteSpace: 'nowrap', color: r.net >= 0 ? 'var(--green)' : 'var(--danger)' }}>
              {r.net >= 0 ? '+' : '−'}{money(Math.abs(r.net))}
            </span>
            <span className="muted no-print" style={{ display: 'inline-flex' }}><IconArrowRight size={15} /></span>
          </div>
        ))}
        {unassignedExp > 0 && (
          <div className="fin-row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}><span className="muted">General (no property)</span></div>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--danger)' }}>−{money(unassignedExp)}</span>
            <span style={{ width: 15 }} className="no-print" />
          </div>
        )}
        <div className="fin-row fin-total" style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}><b>Total</b></div>
          <span className="mono" style={{ fontWeight: 800, color: net >= 0 ? 'var(--green)' : 'var(--danger)' }}>{net >= 0 ? '+' : '−'}{money(Math.abs(net))}</span>
          <span style={{ width: 15 }} className="no-print" />
        </div>
        <style>{`
          .fin-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
            background: var(--line-soft); border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
          .fin-kpis button { background: var(--surface); border: none; padding: 12px 16px; text-align: left;
            cursor: pointer; font-family: inherit; transition: background 0.13s; }
          .fin-kpis button:hover { background: var(--accent-bg); }
          .fk-l { display: block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em;
            text-transform: uppercase; color: var(--text-dim); }
          .fk-v { display: block; font-family: var(--serif); font-size: 1.35rem; font-weight: 600; margin-top: 3px; }
          .fin-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
            border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background 0.13s; }
          .fin-row:hover { background: var(--accent-bg); }
          .fin-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
          .fin-row.fin-total { border-bottom: none; border-top: 2px solid var(--line); background: transparent; }
          .fin-sub { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          @media (max-width: 480px) { .fk-v { font-size: 1.1rem; } }
        `}</style>
      </div>

      {adding && <ExpenseModal userId={userId} properties={properties} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {drill && (
        <PropertyBreakdownModal prop={drill} range={range} periodLabel={periodLabel}
          payments={payments} expenses={expenses} tenants={tenants}
          onClose={() => setDrill(null)} />
      )}
      {card && (
        <CardDetailModal kind={card} periodLabel={periodLabel}
          rows={rows} totals={{ collected: totalCollected, expenses: totalExpenses, net }}
          payments={collectedShown} expenses={shownExpenses} tenants={tenants} properties={properties}
          propOfTenant={propOfTenant} propName={propName}
          onDelete={async (e) => { await db.deleteExpense(e.id); load() }}
          onClose={() => setCard(null)} />
      )}

      <style>{`@media print { .no-print { display:none !important; } .sidebar, .topbar, .ai-fab { display:none !important; } }`}</style>
    </div>
  )
}

// Drill-down: exactly which payments and expenses make up a property's totals.
function PropertyBreakdownModal({ prop, range, periodLabel, payments, expenses, tenants, onClose }) {
  const tids = new Set(tenants.filter((t) => t.property_id === prop.id).map((t) => t.id))
  const collectedRows = payments
    .filter((p) => tids.has(p.tenant_id) && inRange(p.approved_at || p.paid_date, range))
    .sort((a, b) => new Date(b.approved_at || b.paid_date) - new Date(a.approved_at || a.paid_date))
  const expenseRows = expenses
    .filter((e) => e.property_id === prop.id && inRange(e.spent_on, range))
    .sort((a, b) => new Date(b.spent_on) - new Date(a.spent_on))
  const collected = collectedRows.reduce((s, p) => s + Number(p.amount), 0)
  const spent = expenseRows.reduce((s, e) => s + Number(e.amount), 0)
  const net = collected - spent
  const nameOf = (tid) => fullName(tenants.find((t) => t.id === tid)) || 'Tenant'

  return (
    <Modal wide title={prop.name} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="muted" style={{ marginTop: -6, marginBottom: 14 }}>{periodLabel} · {prop.location || prop.suburb || ''}</div>

      <div className="grid stats" style={{ marginBottom: 18 }}>
        <StatCard label="Collected" value={money(collected)} sub={`${collectedRows.length} payment${collectedRows.length === 1 ? '' : 's'}`} icon={<IconWallet size={18} />} />
        <StatCard label="Expenses" value={money(spent)} sub={`${expenseRows.length} item${expenseRows.length === 1 ? '' : 's'}`} icon={<IconClock size={18} />} />
        <StatCard label="Net" value={money(net)} sub={net >= 0 ? 'Profit' : 'Loss'} icon={<IconChart size={18} />} />
      </div>

      <h4 style={{ margin: '4px 0 8px' }}><IconWallet size={14} /> Rent collected — where it comes from</h4>
      {collectedRows.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.86rem' }}>No rent collected for this property in {periodLabel.toLowerCase()}.</p>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 18 }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Tenant</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {collectedRows.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{fmtDate(p.approved_at || p.paid_date)}</td>
                  <td style={{ fontWeight: 600 }}>{nameOf(p.tenant_id)}</td>
                  <td>{p.method}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--green)' }}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 style={{ margin: '4px 0 8px' }}><IconClock size={14} /> Expenses — where they go</h4>
      {expenseRows.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.86rem' }}>No expenses recorded for this property in {periodLabel.toLowerCase()}.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {expenseRows.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtDate(e.spent_on)}</td>
                  <td><span className="pill neutral">{e.category}</span></td>
                  <td className="muted">{e.note || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>−{money(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

// Breakdown shown when a summary card (Collected / Expenses / Net) is clicked.
function CardDetailModal({ kind, periodLabel, rows, totals, payments, expenses, tenants, propOfTenant, propName, onDelete, onClose }) {
  const nameOf = (tid) => fullName(tenants.find((t) => t.id === tid)) || 'Tenant'
  const title = kind === 'collected' ? 'Collected' : kind === 'expenses' ? 'Expenses' : 'Net'

  return (
    <Modal wide title={`${title} · ${periodLabel}`} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      {kind === 'collected' && (
        payments.length === 0 ? <EmptyState icon="🧾" title="No payments in this period" /> : (
          <>
            <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>{payments.length} payment{payments.length === 1 ? '' : 's'} totalling <b style={{ color: 'var(--green)' }}>{money(totals.collected)}</b>.</p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Tenant</th><th>Property</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{fmtDate(p.approved_at || p.paid_date)}</td>
                      <td style={{ fontWeight: 600 }}>{nameOf(p.tenant_id)}</td>
                      <td>{propName(propOfTenant(p.tenant_id))}</td>
                      <td>{p.method}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--green)' }}>{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {kind === 'expenses' && (
        expenses.length === 0 ? <EmptyState icon="🧾" title="No expenses logged">Add expenses to see your true net.</EmptyState> : (
          <>
            <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>{expenses.length} item{expenses.length === 1 ? '' : 's'} totalling <b style={{ color: 'var(--danger)' }}>{money(totals.expenses)}</b>.</p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap">{fmtDate(e.spent_on)}</td>
                      <td><span className="pill neutral">{e.category}</span></td>
                      <td>{propName(e.property_id)}</td>
                      <td className="muted">{e.note || '—'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>−{money(e.amount)}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn sm ghost danger" title="Delete"
                        onClick={() => { if (window.confirm('Delete this expense?')) onDelete(e) }}><IconTrash size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {kind === 'net' && (
        <>
          <div className="net-eq">
            <span><span className="muted">Collected</span><br /><b className="mono" style={{ color: 'var(--green)' }}>{money(totals.collected)}</b></span>
            <span className="net-op">−</span>
            <span><span className="muted">Expenses</span><br /><b className="mono" style={{ color: 'var(--danger)' }}>{money(totals.expenses)}</b></span>
            <span className="net-op">=</span>
            <span><span className="muted">Net</span><br /><b className="mono" style={{ color: totals.net >= 0 ? 'var(--green)' : 'var(--danger)' }}>{money(totals.net)}</b></span>
          </div>
          <h4 style={{ margin: '6px 0 8px' }}>Net by property</h4>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Property</th><th style={{ textAlign: 'right' }}>Collected</th><th style={{ textAlign: 'right' }}>Expenses</th><th style={{ textAlign: 'right' }}>Net</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.prop.id}>
                    <td style={{ fontWeight: 600 }}>{r.prop.name}</td>
                    <td className="mono" style={{ textAlign: 'right', color: r.collected > 0 ? 'var(--green)' : undefined }}>{money(r.collected)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>{r.expenses > 0 ? `−${money(r.expenses)}` : money(0)}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: r.net >= 0 ? 'var(--green)' : 'var(--danger)' }}>{money(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <style>{`.net-eq{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:16px;border:1px solid var(--line);border-radius:var(--radius);margin-bottom:16px;}
            .net-eq b{font-size:1.3rem;font-family:var(--serif);} .net-op{font-size:1.4rem;color:var(--text-faint);}`}</style>
        </>
      )}
    </Modal>
  )
}

function ExpenseModal({ userId, properties, onClose, onSaved }) {
  const toast = useToast()
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!(Number(amount) > 0)) return toast.error('Enter an amount')
    setBusy(true)
    try {
      await db.createExpense(userId, { category, amount: Number(amount), property_id: propertyId || null, spent_on: date, note })
      toast.success('Expense added')
      onSaved()
    } catch (e) { toast.error('Could not save', e.message); setBusy(false) }
  }

  return (
    <Modal title="Add expense" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add expense'}</button></>}>
      <div className="field-row">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input label="Amount (USD)" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <Select label="Property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
        <option value="">General (no property)</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" style={{ minHeight: 70 }} />
    </Modal>
  )
}
