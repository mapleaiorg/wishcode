/**
 * CryptoBuddiesView — gallery of generative NFT-style companions.
 *
 * Renders portraits from genome seeds, supports mint/breed/trade/transfer
 * and an optional listForSale price. Inspired by CryptoKitties: every buddy
 * is deterministic, inheritable, and collectible.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, GitMerge, Send, Tag, X, Sparkles, RefreshCw } from 'lucide-react'
import type { CryptoBuddy } from '../types'
import { renderBuddyDataUrl, RARITY_HALO } from './buddyArt'

type Mode = 'gallery' | 'mint' | 'breed' | 'transfer' | 'list' | 'trade'

export function CryptoBuddiesView() {
  const [buddies, setBuddies] = useState<CryptoBuddy[]>([])
  const [ledger, setLedger] = useState<any[]>([])
  const [mode, setMode] = useState<Mode>('gallery')
  const [selected, setSelected] = useState<CryptoBuddy | null>(null)
  const [partner, setPartner] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [seed, setSeed] = useState('')
  const [toAddr, setToAddr] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      await window.ibank.cryptoBuddies.ensureGenesis()
      const list = (await window.ibank.cryptoBuddies.list()) as CryptoBuddy[]
      setBuddies(list ?? [])
      const led = (await window.ibank.cryptoBuddies.ledger(20)) as any[]
      setLedger(led ?? [])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ibank.cryptoBuddies.onUpdated(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const filtered = useMemo(
    () => onlyMine ? buddies.filter((b) => b.ownerId === 'me') : buddies,
    [buddies, onlyMine],
  )

  const resetForm = () => {
    setMode('gallery'); setPartner(''); setNewName(''); setSeed('')
    setToAddr(''); setPriceUsd(''); setErr(null)
  }

  const onMint = async () => {
    setErr(null)
    try {
      await window.ibank.cryptoBuddies.mint({
        name: newName || undefined,
        seed: seed || undefined,
      })
      resetForm(); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const onBreed = async () => {
    if (!selected || !partner) return
    setErr(null)
    try {
      await window.ibank.cryptoBuddies.breed(selected.id, partner, { name: newName || undefined })
      resetForm(); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const onTransfer = async () => {
    if (!selected || !toAddr) return
    setErr(null)
    try {
      await window.ibank.cryptoBuddies.transfer(selected.id, toAddr.trim())
      resetForm(); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const onListForSale = async () => {
    if (!selected || !priceUsd) return
    setErr(null)
    try {
      await window.ibank.cryptoBuddies.listForSale(selected.id, Number(priceUsd))
      resetForm(); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const onUnlist = async (id: string) => {
    try { await window.ibank.cryptoBuddies.unlist(id); void refresh() }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const onTrade = async () => {
    if (!selected || !partner) return
    setErr(null)
    try {
      await window.ibank.cryptoBuddies.trade(
        selected.id, partner,
        priceUsd ? Number(priceUsd) : undefined,
      )
      resetForm(); void refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2><Sparkles size={14} style={{ verticalAlign: -2 }} /> CryptoBuddies</h2>
        <div className="ibn-panel-head-actions">
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only mine
          </label>
          <button className="ibn-btn" onClick={() => void refresh()}><RefreshCw size={12} /> Refresh</button>
          <button className="ibn-btn primary" onClick={() => { setSelected(null); setMode('mint') }}>
            <Plus size={12} /> Mint
          </button>
        </div>
      </header>

      {err && <div style={{ color: 'var(--err)', fontSize: 12, padding: '6px 10px' }}>{err}</div>}

      {mode !== 'gallery' && (
        <div className="ibn-card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>
              {mode === 'mint' && 'Mint new buddy'}
              {mode === 'breed' && `Breed with ${selected?.name}`}
              {mode === 'transfer' && `Transfer ${selected?.name}`}
              {mode === 'list' && `List ${selected?.name} for sale`}
              {mode === 'trade' && `Trade ${selected?.name}`}
            </h3>
            <button className="ibn-btn" onClick={resetForm}><X size={12} /></button>
          </div>

          {(mode === 'mint' || mode === 'breed') && (
            <input
              className="ibn-input" placeholder="Name (optional)"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
          )}
          {mode === 'mint' && (
            <input
              className="ibn-input" placeholder="Seed (optional — random if blank)"
              value={seed} onChange={(e) => setSeed(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
          )}
          {(mode === 'breed' || mode === 'trade') && (
            <select
              className="ibn-input" value={partner} onChange={(e) => setPartner(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            >
              <option value="">
                {mode === 'breed' ? 'Select breeding partner…' : 'Select buddy to trade with…'}
              </option>
              {buddies.filter((b) => b.id !== selected?.id).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.genome.rarity} · {b.genome.element}) {b.ownerId !== 'me' && '— other'}
                </option>
              ))}
            </select>
          )}
          {mode === 'transfer' && (
            <input
              className="ibn-input" placeholder="Recipient (ownerId / address)"
              value={toAddr} onChange={(e) => setToAddr(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
          )}
          {(mode === 'list' || mode === 'trade') && (
            <input
              className="ibn-input"
              placeholder={mode === 'list' ? 'Price in USD' : 'Optional USD consideration'}
              value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            {mode === 'mint' && <button className="ibn-btn primary" onClick={onMint}>Mint</button>}
            {mode === 'breed' && <button className="ibn-btn primary" onClick={onBreed} disabled={!partner}>Breed</button>}
            {mode === 'transfer' && <button className="ibn-btn primary" onClick={onTransfer} disabled={!toAddr}>Transfer</button>}
            {mode === 'list' && <button className="ibn-btn primary" onClick={onListForSale} disabled={!priceUsd}>List</button>}
            {mode === 'trade' && <button className="ibn-btn primary" onClick={onTrade} disabled={!partner}>Swap</button>}
            <button className="ibn-btn" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p style={{ color: 'var(--text-mute)' }}>No buddies yet. Hit Mint, or toggle off "Only mine" to browse the roster.</p>
      )}

      {filtered.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((b) => {
            const halo = RARITY_HALO[b.genome.rarity]
            const mine = b.ownerId === 'me'
            return (
              <div key={b.id} className="ibn-card" style={{ padding: 8, borderColor: halo }}>
                <img
                  src={renderBuddyDataUrl(b.genome, 200)}
                  alt={b.name}
                  style={{ width: '100%', borderRadius: 8, background: 'var(--bg-2)' }}
                />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: halo, textTransform: 'uppercase' }}>
                      {b.genome.rarity} · {b.genome.element}
                    </div>
                  </div>
                  {b.priceListingUsd != null && (
                    <span className="pill" style={{ fontSize: 10 }}>
                      ${b.priceListingUsd.toFixed(0)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>
                  lv.{b.genome.level} · {b.mintedFrom} {b.parentIds && `· ${b.parentIds.length}p`}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {mine ? (
                    <>
                      <button className="ibn-btn" style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => { setSelected(b); setMode('breed') }}>
                        <GitMerge size={10} /> Breed
                      </button>
                      <button className="ibn-btn" style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => { setSelected(b); setMode('transfer') }}>
                        <Send size={10} /> Transfer
                      </button>
                      {b.priceListingUsd != null
                        ? <button className="ibn-btn danger" style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={() => onUnlist(b.id)}>Unlist</button>
                        : <button className="ibn-btn" style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={() => { setSelected(b); setMode('list') }}>
                            <Tag size={10} /> List
                          </button>
                      }
                      <button className="ibn-btn" style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => { setSelected(b); setMode('trade') }}>Swap</button>
                    </>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>owner: {b.ownerId}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ledger.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>Recent activity</h3>
          <table className="ibn-table">
            <thead><tr><th>Time</th><th>Event</th><th>Subject</th><th>From → To</th></tr></thead>
            <tbody>
              {ledger.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11 }}>{new Date(e.ts).toLocaleString()}</td>
                  <td><span className="pill">{e.kind}</span></td>
                  <td>{e.buddyId ?? e.a ?? '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                    {e.from ? `${e.from} → ${e.to}` : e.b ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
