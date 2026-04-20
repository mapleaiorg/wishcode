/**
 * AddressBookView — local contact list of saved send targets per chain.
 *
 * Contacts are stored in localStorage. Labels + notes are renderer-only,
 * so no native state is added. The address itself is echoed verbatim —
 * iBank never rewrites addresses; a contact is only a mnemonic label.
 */

import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Contact2 } from 'lucide-react'
import {
  addContact, getContacts, removeContact,
  type ChainId, type Contact,
} from '../../lib/localStore'

const CHAINS: ChainId[] = [
  'eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'btc', 'solana', 'tron',
]

function shortAddr(a: string): string {
  if (a.length <= 14) return a
  return `${a.slice(0, 8)}…${a.slice(-6)}`
}

export function AddressBookView() {
  const [contacts, setContacts] = useState<Contact[]>(() => getContacts())
  const [label, setLabel]       = useState('')
  const [chain, setChain]       = useState<ChainId>('eth')
  const [address, setAddress]   = useState('')
  const [note, setNote]         = useState('')
  const [filter, setFilter]     = useState<ChainId | 'all'>('all')

  const filtered = useMemo(
    () => filter === 'all' ? contacts : contacts.filter((c) => c.chain === filter),
    [contacts, filter],
  )

  const add = () => {
    const lbl = label.trim()
    const addr = address.trim()
    if (!lbl || !addr) return
    addContact({ label: lbl, chain, address: addr, note: note.trim() || undefined })
    setContacts(getContacts())
    setLabel('')
    setAddress('')
    setNote('')
  }

  const canSave = label.trim().length > 0 && address.trim().length > 0

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Address Book</h2>
        <div className="ibn-panel-head-actions">
          <span className="ibn-pill ibn-pill-subtle">{contacts.length} saved</span>
        </div>
      </header>

      <section className="ibn-card">
        <h3 className="ibn-card-title"><Plus size={13} /> New contact</h3>
        <div className="ibn-form-row">
          <label className="ibn-filter">
            <span>Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cold wallet"
            />
          </label>
          <label className="ibn-filter">
            <span>Chain</span>
            <select value={chain} onChange={(e) => setChain(e.target.value as ChainId)}>
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="ibn-filter" style={{ flex: 2 }}>
            <span>Address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… / bc1… / …"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </label>
          <label className="ibn-filter" style={{ flex: 1 }}>
            <span>Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
            />
          </label>
          <button className="ibn-btn primary" onClick={add} disabled={!canSave}>
            Save contact
          </button>
        </div>
        <p className="ibn-micro-disclaimer">
          iBank stores contacts locally. Always verify the address on-screen before signing a
          transaction; the label is for your memory only and is never sent on-chain.
        </p>
      </section>

      <section className="ibn-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="ibn-card-title"><Contact2 size={13} /> Contacts</h3>
          <label className="ibn-filter">
            <span>Chain</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as ChainId | 'all')}>
              <option value="all">All</option>
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {filtered.length === 0 ? (
          <div className="ibn-muted">
            {contacts.length === 0 ? 'No contacts yet.' : 'No contacts on this chain.'}
          </div>
        ) : (
          <table className="ibn-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Chain</th>
                <th>Address</th>
                <th>Note</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.label}</strong></td>
                  <td><span className="ibn-chain-pill">{c.chain}</span></td>
                  <td className="ibn-addr" title={c.address}>{shortAddr(c.address)}</td>
                  <td className="ibn-muted">{c.note ?? ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="ibn-icon-btn"
                      title="Delete contact"
                      onClick={() => setContacts(removeContact(c.id))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
