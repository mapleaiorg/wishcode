/**
 * WalletView — overview, receive (QR + copy), send, and on-chain history.
 *
 * Locked state still shows accounts + receive addresses + QR codes; balances,
 * history fetch, and send require unlock.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Lock, Unlock, Eye, Trash2, Plus, Copy, Check, ExternalLink, Send as SendIcon, ArrowDown, History, Wallet as WalletIcon } from 'lucide-react'
import type { WalletAccount, BalanceView, WalletStatusView, TxEntry, SendPreview, ChainId } from '../types'
import { QrCode } from './QrCode'

type Mode = 'view' | 'create' | 'unlock' | 'reveal' | 'remove'
type Tab = 'overview' | 'receive' | 'send' | 'history'

export function WalletView() {
  const [status, setStatus] = useState<WalletStatusView | null>(null)
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [balances, setBalances] = useState<BalanceView[]>([])
  const [mode, setMode] = useState<Mode>('view')
  const [tab, setTab] = useState<Tab>('overview')
  const [pass, setPass] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await window.ibank.wallet.status()
      setStatus(s as WalletStatusView)
      const acc = (await window.ibank.wallet.accounts()) as WalletAccount[]
      setAccounts(acc ?? [])
      if (s.unlocked) {
        const bal = (await window.ibank.wallet.balances()) as BalanceView[]
        setBalances(bal ?? [])
      } else {
        setBalances([])
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ibank.wallet.onLockChanged(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const onUnlock = async () => {
    setErr(null)
    try { await window.ibank.wallet.unlock(pass); setPass(''); setMode('view'); void refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }
  const onCreate = async () => {
    setErr(null)
    try {
      const res = await window.ibank.wallet.create(pass, mnemonic || undefined) as any
      setRevealed(res.mnemonic); setPass(''); setMnemonic(''); setMode('view'); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }
  const onReveal = async () => {
    setErr(null)
    try { const m = await window.ibank.wallet.revealMnemonic(pass); setRevealed(m); setPass(''); setMode('view') }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }
  const onLock = async () => { await window.ibank.wallet.lock(); void refresh() }
  const onRemove = async () => {
    setErr(null)
    try { await window.ibank.wallet.remove(pass); setPass(''); setMode('view'); setRevealed(null); void refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const totalUsd = balances.reduce((acc, b) => acc + (b.usdValue ?? 0), 0)

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Wallet</h2>
        <div className="ibn-panel-head-actions">
          {status?.exists && (
            status.unlocked
              ? <button className="ibn-btn" onClick={onLock}><Lock size={12} /> Lock</button>
              : <button className="ibn-btn" onClick={() => setMode('unlock')}><Unlock size={12} /> Unlock</button>
          )}
          {!status?.exists && <button className="ibn-btn primary" onClick={() => setMode('create')}><Plus size={12} /> Create</button>}
          {status?.exists && status.unlocked && <button className="ibn-btn" onClick={() => setMode('reveal')}><Eye size={12} /> Reveal backup</button>}
          {status?.exists && <button className="ibn-btn danger" onClick={() => setMode('remove')}><Trash2 size={12} /> Remove</button>}
        </div>
      </header>

      {status?.exists && (
        <nav className="ibn-tabs" style={{ marginBottom: 12 }}>
          {(['overview', 'receive', 'send', 'history'] as Tab[]).map((t) => (
            <button key={t} className={`ibn-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' && (<><WalletIcon size={12} /> Overview</>)}
              {t === 'receive'  && (<><ArrowDown size={12} /> Receive</>)}
              {t === 'send'     && (<><SendIcon size={12} /> Send</>)}
              {t === 'history'  && (<><History size={12} /> History</>)}
            </button>
          ))}
        </nav>
      )}

      {mode !== 'view' && (
        <PassphraseForm
          mode={mode} pass={pass} setPass={setPass}
          mnemonic={mnemonic} setMnemonic={setMnemonic}
          err={err}
          onCancel={() => { setMode('view'); setErr(null); setPass(''); setMnemonic('') }}
          onCreate={onCreate} onUnlock={onUnlock} onReveal={onReveal} onRemove={onRemove}
        />
      )}

      {revealed && (
        <div className="ibn-card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--warn)' }}>
          <strong>Recovery phrase — write this down now; it will not be shown again.</strong>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{revealed}</pre>
          <button className="ibn-btn" onClick={() => setRevealed(null)}>I've saved it</button>
        </div>
      )}

      {status?.exists && tab === 'overview' && (
        <OverviewTab accounts={accounts} balances={balances} totalUsd={totalUsd} unlocked={!!status.unlocked} />
      )}
      {status?.exists && tab === 'receive' && (
        <ReceiveTab accounts={accounts} />
      )}
      {status?.exists && tab === 'send' && (
        <SendTab accounts={accounts} unlocked={!!status.unlocked} onSent={() => void refresh()} />
      )}
      {status?.exists && tab === 'history' && (
        <HistoryTab accounts={accounts} unlocked={!!status.unlocked} />
      )}
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────

function OverviewTab({ accounts, balances, totalUsd, unlocked }: {
  accounts: WalletAccount[]; balances: BalanceView[]; totalUsd: number; unlocked: boolean
}) {
  return (
    <>
      <section>
        <h3>Accounts</h3>
        {accounts.length === 0 && <p style={{ color: 'var(--text-mute)' }}>No wallet yet.</p>}
        {accounts.length > 0 && (
          <table className="ibn-table">
            <thead><tr><th>Chain</th><th>Symbol</th><th>Address</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.chain}>
                  <td>{a.chain}</td>
                  <td>{a.symbol}</td>
                  <td><code>{a.address}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Balances {unlocked && <span style={{ color: 'var(--text-mute)', fontSize: 12 }}>· ${totalUsd.toFixed(2)} total</span>}</h3>
        {!unlocked && <p style={{ color: 'var(--text-mute)' }}>Unlock to view balances.</p>}
        {unlocked && balances.length === 0 && <p style={{ color: 'var(--text-mute)' }}>Fetching…</p>}
        {balances.length > 0 && (
          <table className="ibn-table">
            <thead><tr><th>Chain</th><th>Symbol</th><th>Amount</th><th>USD</th></tr></thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.chain + b.symbol}>
                  <td>{b.chain}</td>
                  <td>{b.symbol}</td>
                  <td>{b.formatted}</td>
                  <td>{b.usdValue != null ? `$${b.usdValue.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

// ── Receive (QR + copy) ──────────────────────────────────────────────

function AddressCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400) }
    catch { /* ignore */ }
  }
  return (
    <button className="ibn-btn" onClick={copy} title="Copy to clipboard">
      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
    </button>
  )
}

function ReceiveTab({ accounts }: { accounts: WalletAccount[] }) {
  const [selected, setSelected] = useState<ChainId>(accounts[0]?.chain ?? 'eth')
  const acc = accounts.find((a) => a.chain === selected) ?? accounts[0]
  if (!acc) return <p style={{ color: 'var(--text-mute)' }}>No accounts.</p>
  return (
    <section className="ibn-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {accounts.map((a) => (
          <button
            key={a.chain}
            className={`ibn-btn ${selected === a.chain ? 'primary' : ''}`}
            onClick={() => setSelected(a.chain)}
          >
            {a.chain.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18, alignItems: 'center' }}>
        <QrCode text={acc.address} size={220} />
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>
            {acc.symbol} address — {acc.chain}
          </div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 10 }}>
            {acc.address}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 10 }}>
            Only send <strong>{acc.symbol}</strong>{' '}
            {acc.chain === 'eth' && '(ERC-20 tokens on Ethereum mainnet) '}
            to this address. Sending from a wrong network will lose funds.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <AddressCopy text={acc.address} />
            <button
              className="ibn-btn"
              onClick={() => void window.ibank.app.openExternal(explorerAddressFor(acc.chain, acc.address))}
            >
              <ExternalLink size={12} /> View on explorer
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

const EXPLORER_ADDR: Record<string, string> = {
  eth: 'https://etherscan.io/address/{a}', arbitrum: 'https://arbiscan.io/address/{a}',
  optimism: 'https://optimistic.etherscan.io/address/{a}', base: 'https://basescan.org/address/{a}',
  polygon: 'https://polygonscan.com/address/{a}', bsc: 'https://bscscan.com/address/{a}',
  btc: 'https://mempool.space/address/{a}', solana: 'https://solscan.io/account/{a}',
  tron: 'https://tronscan.org/#/address/{a}',
}
function explorerAddressFor(chain: string, addr: string): string {
  const tpl = EXPLORER_ADDR[chain] ?? EXPLORER_ADDR.eth
  return tpl.replace('{a}', addr)
}

// ── Send ─────────────────────────────────────────────────────────────

const EVM_CHAINS: ChainId[] = ['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc']

function SendTab({ accounts, unlocked, onSent }: {
  accounts: WalletAccount[]; unlocked: boolean; onSent: () => void
}) {
  const [chain, setChain] = useState<ChainId>('eth')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [preview, setPreview] = useState<SendPreview | null>(null)
  const [result, setResult] = useState<{ hash: string; explorerUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isEvm = EVM_CHAINS.includes(chain)

  const doPreview = async () => {
    setErr(null); setResult(null); setPreview(null)
    try {
      const p = await window.ibank.wallet.sendPreview(chain, to, amount)
      setPreview(p)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }
  const doSend = async () => {
    if (!preview) return
    setErr(null); setBusy(true)
    try {
      const res = await window.ibank.wallet.send({ chain, to, amount, passphrase: passphrase || undefined })
      setResult({ hash: res.hash, explorerUrl: res.explorerUrl })
      setPreview(null); setPassphrase(''); onSent()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setBusy(false) }
  }

  if (!unlocked) return <p style={{ color: 'var(--text-mute)' }}>Unlock the wallet to send.</p>

  return (
    <section className="ibn-card" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>Send native asset</h3>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {accounts.map((a) => (
          <button key={a.chain} className={`ibn-btn ${chain === a.chain ? 'primary' : ''}`} onClick={() => { setChain(a.chain); setPreview(null); setResult(null) }}>
            {a.chain.toUpperCase()} · {a.symbol}
          </button>
        ))}
      </div>

      {!isEvm && (
        <div className="ibn-helper warn" style={{ marginBottom: 10 }}>
          Send on <strong>{chain}</strong> is not yet supported in this build. EVM chains (ETH / Arbitrum / Optimism / Base / Polygon / BSC) work end-to-end.
          For {chain}, use your existing external wallet and import the recovery phrase shown in "Reveal backup".
        </div>
      )}

      <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Recipient address</label>
      <input className="ibn-input" value={to} onChange={(e) => setTo(e.target.value)}
             placeholder="0x…" style={{ width: '100%', margin: '4px 0 10px' }} disabled={!isEvm} />

      <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Amount</label>
      <input className="ibn-input" value={amount} onChange={(e) => setAmount(e.target.value)}
             placeholder="e.g. 0.01" style={{ width: '100%', margin: '4px 0 10px' }} disabled={!isEvm} />

      {preview?.policy.requiresPassphrase && (
        <>
          <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Passphrase (required — this amount exceeds the policy threshold)
          </label>
          <input className="ibn-input" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                 style={{ width: '100%', margin: '4px 0 10px' }} />
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="ibn-btn" onClick={doPreview} disabled={!isEvm || !to || !amount || busy}>
          Preview fee
        </button>
        <button className="ibn-btn primary" onClick={doSend}
                disabled={!preview || !preview.policy.allowed || busy || (preview.policy.requiresPassphrase && !passphrase)}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>

      {err && <div className="ibn-helper warn">{err}</div>}

      {preview && (
        <div className="ibn-card" style={{ padding: 10, marginTop: 10 }}>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div><strong>From:</strong> <code>{preview.from}</code></div>
            <div><strong>To:</strong> <code>{preview.to}</code></div>
            <div><strong>Amount:</strong> {preview.amount} {preview.symbol}{preview.usdValue != null && ` (~$${preview.usdValue.toFixed(2)})`}</div>
            <div><strong>Est. fee:</strong> {preview.fee.fee} {preview.fee.symbol}</div>
            <div>
              <strong>Policy:</strong>{' '}
              {preview.policy.allowed
                ? <span style={{ color: 'var(--ok)' }}>allowed</span>
                : <span style={{ color: 'var(--err)' }}>blocked · {preview.policy.reasons.join('; ')}</span>}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="ibn-card" style={{ padding: 10, marginTop: 10, borderColor: 'var(--ok)' }}>
          <div style={{ fontSize: 12 }}>
            <div><strong>Broadcast ✓</strong></div>
            <div style={{ wordBreak: 'break-all', marginTop: 4 }}><code>{result.hash}</code></div>
            <button className="ibn-btn" style={{ marginTop: 6 }}
                    onClick={() => void window.ibank.app.openExternal(result.explorerUrl)}>
              <ExternalLink size={12} /> View on explorer
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ── History ──────────────────────────────────────────────────────────

function HistoryTab({ accounts, unlocked }: { accounts: WalletAccount[]; unlocked: boolean }) {
  const [chain, setChain] = useState<ChainId>(accounts[0]?.chain ?? 'eth')
  const [rows, setRows] = useState<TxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const acc = accounts.find((a) => a.chain === chain)

  const load = useCallback(async () => {
    if (!acc) return
    setErr(null); setLoading(true); setRows([])
    try {
      const res = await window.ibank.wallet.history(chain, acc.address) as TxEntry[]
      setRows(res ?? [])
    } catch (e: any) { setErr(e?.message ?? String(e)) }
    finally { setLoading(false) }
  }, [acc, chain])

  useEffect(() => { if (unlocked) void load() }, [load, unlocked])

  if (!unlocked) return <p style={{ color: 'var(--text-mute)' }}>Unlock the wallet to view history.</p>
  if (!acc) return <p style={{ color: 'var(--text-mute)' }}>No accounts.</p>

  return (
    <section>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {accounts.map((a) => (
          <button key={a.chain} className={`ibn-btn ${chain === a.chain ? 'primary' : ''}`} onClick={() => setChain(a.chain)}>
            {a.chain.toUpperCase()}
          </button>
        ))}
        <button className="ibn-btn" onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>

      {err && <div className="ibn-helper warn" style={{ marginBottom: 8 }}>{err}</div>}
      {loading && <p style={{ color: 'var(--text-mute)' }}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <p style={{ color: 'var(--text-mute)' }}>
          No transactions yet for this chain.
          {chain !== 'btc' && (
            <> For richer history on EVM chains, add an Etherscan API key to config
              (<code>wallet.etherscanApiKey</code>).</>
          )}
        </p>
      )}

      {rows.length > 0 && (
        <table className="ibn-table">
          <thead>
            <tr>
              <th>Dir</th>
              <th>When</th>
              <th>Counterparty</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.chain + ':' + r.hash}>
                <td>
                  {r.direction === 'in'   && <span style={{ color: 'var(--ok)' }}>↓ in</span>}
                  {r.direction === 'out'  && <span style={{ color: 'var(--warn)' }}>↑ out</span>}
                  {r.direction === 'self' && <span>↻ self</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : '—'}
                </td>
                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.direction === 'in' ? r.from : r.to}
                </td>
                <td>{r.amount} {r.symbol}</td>
                <td>
                  {r.status === 'confirmed' && <span style={{ color: 'var(--ok)' }}>confirmed</span>}
                  {r.status === 'pending'   && <span style={{ color: 'var(--warn)' }}>pending</span>}
                  {r.status === 'failed'    && <span style={{ color: 'var(--err)' }}>failed</span>}
                </td>
                <td>
                  {r.explorerUrl && (
                    <button className="ibn-btn" onClick={() => void window.ibank.app.openExternal(r.explorerUrl!)}>
                      <ExternalLink size={11} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ── Passphrase form (factored out) ────────────────────────────────────

function PassphraseForm({ mode, pass, setPass, mnemonic, setMnemonic, err, onCancel, onCreate, onUnlock, onReveal, onRemove }: {
  mode: Mode
  pass: string; setPass: (v: string) => void
  mnemonic: string; setMnemonic: (v: string) => void
  err: string | null
  onCancel: () => void
  onCreate: () => void; onUnlock: () => void; onReveal: () => void; onRemove: () => void
}) {
  return (
    <div className="ibn-card" style={{ padding: 14, marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>
        {mode === 'create' && 'Create wallet'}
        {mode === 'unlock' && 'Unlock wallet'}
        {mode === 'reveal' && 'Reveal recovery phrase'}
        {mode === 'remove' && 'Remove wallet'}
      </h3>

      {mode === 'create' && (
        <>
          <div className="ibn-helper info" style={{ marginBottom: 10 }}>
            <strong>You choose this passphrase.</strong> It encrypts your private keys on this device
            and is never sent anywhere. If you forget it, the only way to recover is the 12/24-word
            recovery phrase shown at the end of creation.
          </div>
          <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Recovery phrase</label>
          <input className="ibn-input"
            placeholder="Leave blank to generate a fresh 12-word phrase, or paste an existing one"
            value={mnemonic} onChange={(e) => setMnemonic(e.target.value)}
            style={{ width: '100%', margin: '4px 0 10px' }} />
        </>
      )}
      {mode === 'unlock' && (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 0 }}>
          Enter the passphrase you chose when creating this wallet. After idle time the wallet re-locks automatically.
        </p>
      )}
      {mode === 'reveal' && (
        <div className="ibn-helper warn" style={{ marginBottom: 10 }}>
          You are about to display the raw 12/24-word recovery phrase. Anyone who sees it can move all funds.
        </div>
      )}
      {mode === 'remove' && (
        <div className="ibn-helper warn" style={{ marginBottom: 10 }}>
          This deletes the encrypted keystore on this device. Recovery only possible with your recovery phrase.
        </div>
      )}

      <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        Passphrase{mode === 'create' ? ' (choose one, 8+ chars)' : ''}
      </label>
      <input className="ibn-input" type="password"
        placeholder={mode === 'create' ? 'Choose a strong passphrase' : 'Passphrase'}
        value={pass} onChange={(e) => setPass(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (mode === 'create') onCreate()
            else if (mode === 'unlock') onUnlock()
            else if (mode === 'reveal') onReveal()
            else if (mode === 'remove') onRemove()
          }
        }}
        style={{ width: '100%', margin: '4px 0 8px' }} />
      {err && <div style={{ color: 'var(--err)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'create' && <button className="ibn-btn primary" onClick={onCreate} disabled={pass.length < 8}>Create wallet</button>}
        {mode === 'unlock' && <button className="ibn-btn primary" onClick={onUnlock} disabled={!pass}>Unlock</button>}
        {mode === 'reveal' && <button className="ibn-btn primary" onClick={onReveal} disabled={!pass}>Reveal</button>}
        {mode === 'remove' && <button className="ibn-btn danger" onClick={onRemove} disabled={!pass}>Confirm remove</button>}
        <button className="ibn-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
