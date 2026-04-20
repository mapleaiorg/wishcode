/**
 * NftGallery — ERC-721 / ERC-1155 viewer.
 *
 * Lists NFTs across EVM chains from the local index, exposes a
 * per-(chain, owner) refresh, a metadata drawer, and an unsigned
 * transfer builder. The component never signs — it just surfaces
 * the transaction the main process computed.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send, Trash2, Image as ImageIcon } from 'lucide-react'
import type { NftAsset, WalletAccount, ChainId } from '../types'

const EVM_CHAINS: ChainId[] = ['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc']

function ipfsToHttp(url?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('ipfs://')) {
    const path = url.slice('ipfs://'.length).replace(/^ipfs\//, '')
    return `https://ipfs.io/ipfs/${path}`
  }
  if (url.startsWith('ar://')) return `https://arweave.net/${url.slice('ar://'.length)}`
  return url
}

export function NftGallery() {
  const [assets, setAssets] = useState<NftAsset[]>([])
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [chainFilter, setChainFilter] = useState<'all' | ChainId>('all')
  const [selected, setSelected] = useState<NftAsset | null>(null)
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('1')
  const [transferResult, setTransferResult] = useState<{ to: string; data: string; chain: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = (await window.ibank.nft.list()) as NftAsset[]
      setAssets(list ?? [])
      const acc = (await window.ibank.wallet.accounts()) as WalletAccount[]
      setAccounts(acc ?? [])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.ibank.nft.onUpdated(() => { void refresh() })
    return () => unsub?.()
  }, [refresh])

  const runFullRefresh = async () => {
    setErr(null); setLoading(true)
    try {
      for (const a of accounts.filter((x) => EVM_CHAINS.includes(x.chain))) {
        await window.ibank.nft.refresh(a.chain, a.address)
      }
      await refresh()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const clearIndex = async () => {
    if (!confirm('Clear local NFT index?')) return
    try {
      await window.ibank.nft.clear()
      await refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const fetchMeta = async (a: NftAsset) => {
    setSelected(a)
    setTransferTo(''); setTransferAmount(a.standard === 'erc1155' ? '1' : '1'); setTransferResult(null)
    if (!a.metadata) {
      try { await window.ibank.nft.metadata(a.key) } catch {}
    }
  }

  const buildTransfer = async () => {
    if (!selected || !transferTo) return
    setErr(null)
    try {
      const tx = await window.ibank.nft.buildTransfer(
        selected.key, transferTo.trim(),
        selected.standard === 'erc1155' ? transferAmount : undefined,
      )
      setTransferResult(tx)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const filtered = useMemo(
    () => chainFilter === 'all' ? assets : assets.filter((a) => a.chain === chainFilter),
    [assets, chainFilter],
  )

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>NFTs</h2>
        <div className="ibn-panel-head-actions">
          <select
            className="ibn-input"
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value as any)}
            style={{ fontSize: 12 }}
          >
            <option value="all">All chains</option>
            {EVM_CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="ibn-btn" disabled={loading} onClick={runFullRefresh}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="ibn-btn danger" onClick={clearIndex}>
            <Trash2 size={12} /> Clear index
          </button>
        </div>
      </header>

      {err && <div style={{ color: 'var(--err)', fontSize: 12, padding: '6px 10px' }}>{err}</div>}

      {filtered.length === 0 && (
        <p style={{ color: 'var(--text-mute)' }}>
          {assets.length === 0
            ? 'No NFTs indexed yet. Unlock wallet and hit Refresh.'
            : 'No NFTs match the filter.'}
        </p>
      )}

      {filtered.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((a) => {
            const img = ipfsToHttp(a.metadata?.image)
            const name = a.metadata?.name ?? `#${a.tokenId.slice(0, 10)}`
            return (
              <div
                key={a.key}
                className="ibn-card"
                style={{ padding: 8, cursor: 'pointer' }}
                onClick={() => void fetchMeta(a)}
              >
                <div
                  style={{
                    aspectRatio: '1 / 1', borderRadius: 8,
                    background: 'var(--bg-2)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', marginBottom: 6,
                  }}
                >
                  {img
                    ? <img src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ImageIcon size={32} color="var(--text-mute)" />}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>
                  {a.chain} · {a.standard} {a.standard === 'erc1155' && `· ×${a.balance}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
            background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
            padding: 16, overflowY: 'auto', zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{selected.metadata?.name ?? `#${selected.tokenId.slice(0, 10)}`}</h3>
            <button className="ibn-btn" onClick={() => setSelected(null)}>Close</button>
          </div>

          {selected.metadata?.image && (
            <img
              src={ipfsToHttp(selected.metadata.image)}
              alt=""
              style={{ width: '100%', borderRadius: 8, marginBottom: 12 }}
            />
          )}

          <dl style={{ fontSize: 12 }}>
            <dt style={{ color: 'var(--text-mute)' }}>Chain</dt><dd>{selected.chain}</dd>
            <dt style={{ color: 'var(--text-mute)' }}>Standard</dt><dd>{selected.standard}</dd>
            <dt style={{ color: 'var(--text-mute)' }}>Contract</dt>
            <dd style={{ wordBreak: 'break-all' }}><code>{selected.contract}</code></dd>
            <dt style={{ color: 'var(--text-mute)' }}>Token ID</dt>
            <dd style={{ wordBreak: 'break-all' }}><code>{selected.tokenId}</code></dd>
            {selected.standard === 'erc1155' && (
              <>
                <dt style={{ color: 'var(--text-mute)' }}>Balance</dt><dd>{selected.balance}</dd>
              </>
            )}
          </dl>

          {selected.metadata?.description && (
            <p style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 12 }}>
              {selected.metadata.description}
            </p>
          )}

          {selected.metadata?.attributes && selected.metadata.attributes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
              {selected.metadata.attributes.map((at, i) => (
                <div key={i} className="ibn-card" style={{ padding: 6, fontSize: 11 }}>
                  <div style={{ color: 'var(--text-mute)' }}>{at.trait_type}</div>
                  <div style={{ fontWeight: 600 }}>{String(at.value)}</div>
                </div>
              ))}
            </div>
          )}

          <hr style={{ margin: '16px 0', borderColor: 'var(--line)' }} />

          <h4 style={{ marginTop: 0 }}>Transfer</h4>
          <input
            className="ibn-input" placeholder="Recipient address (0x…)"
            value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          {selected.standard === 'erc1155' && (
            <input
              className="ibn-input" placeholder="Amount"
              value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
          )}
          <button className="ibn-btn primary" onClick={buildTransfer} disabled={!transferTo}>
            <Send size={12} /> Build unsigned tx
          </button>

          {transferResult && (
            <div className="ibn-card" style={{ padding: 8, marginTop: 12, fontSize: 11 }}>
              <div><strong>Chain:</strong> {transferResult.chain}</div>
              <div><strong>To:</strong> <code style={{ wordBreak: 'break-all' }}>{transferResult.to}</code></div>
              <div style={{ marginTop: 6 }}><strong>Data:</strong></div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
                {transferResult.data}
              </pre>
              <div style={{ color: 'var(--text-mute)', marginTop: 4 }}>
                Sign & broadcast from the wallet view.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
