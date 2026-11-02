import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: BillSplitterApp,
})

type Home = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
}

type Share = {
  id: string
  memberId: string
  memberName?: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

function formatCents(cents: number): string {
  const dollars = (cents / 100).toFixed(2)
  return `$${dollars} (${cents}¢)`
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return 'Unpaid'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Paid'
  }
}

function BillSplitterApp() {
  const [homes, setHomes] = useState<Home[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [pageError, setPageError] = useState<string | null>(null)

  // Creation form states
  const [newHomeName, setNewHomeName] = useState('')
  const [isCreatingHome, setIsCreatingHome] = useState(false)
  const [homeFormError, setHomeFormError] = useState<string | null>(null)

  const [newMemberName, setNewMemberName] = useState('')
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [memberFormError, setMemberFormError] = useState<string | null>(null)

  const [newBillTitle, setNewBillTitle] = useState('')
  const [newBillCents, setNewBillCents] = useState('')
  const [isCreatingBill, setIsCreatingBill] = useState(false)
  const [billFormError, setBillFormError] = useState<string | null>(null)

  // Payment states per share
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})

  // Fetch all homes on initial mount
  const fetchHomes = useCallback(async () => {
    setIsLoading(true)
    setPageError(null)
    try {
      const res = await fetch('/api/homes')
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || `Failed to fetch homes (${res.status})`)
      }
      const data = (await res.json()) as { homes: Home[] }
      setHomes(data.homes || [])
      if (data.homes.length > 0 && !selectedHomeId) {
        setSelectedHomeId(data.homes[0]?.id ?? '')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setPageError(message)
    } finally {
      setIsLoading(false)
    }
  }, [selectedHomeId])

  // Fetch details (members, bills, balances) for current home
  const fetchHomeDetails = useCallback(async (homeId: string) => {
    if (!homeId) return
    setPageError(null)
    try {
      const [membersRes, billsRes, balancesRes] = await Promise.all([
        fetch(`/api/homes/${homeId}/members`),
        fetch(`/api/homes/${homeId}/bills`),
        fetch(`/api/homes/${homeId}/balances`),
      ])

      if (membersRes.ok) {
        const memData = (await membersRes.json()) as { members: Member[] }
        setMembers(memData.members || [])
      }

      if (billsRes.ok) {
        const billData = (await billsRes.json()) as { bills: Bill[] }
        setBills(billData.bills || [])
      }

      if (balancesRes.ok) {
        const balData = (await balancesRes.json()) as { balances: Balance[] }
        setBalances(balData.balances || [])
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load home details'
      setPageError(message)
    }
  }, [])

  useEffect(() => {
    fetchHomes()
  }, [fetchHomes])

  useEffect(() => {
    if (selectedHomeId) {
      fetchHomeDetails(selectedHomeId)
    } else {
      setMembers([])
      setBills([])
      setBalances([])
    }
  }, [selectedHomeId, fetchHomeDetails])

  // Create Home handler
  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim()) return

    setIsCreatingHome(true)
    setHomeFormError(null)
    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })
      const data = (await res.json().catch(() => null)) as {
        id?: string
        name?: string
        error?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create home')
      }
      if (data?.id) {
        const created: Home = { id: data.id, name: data.name ?? newHomeName.trim() }
        setHomes((prev) => [...prev, created])
        setSelectedHomeId(data.id)
        setNewHomeName('')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error creating home'
      setHomeFormError(message)
    } finally {
      setIsCreatingHome(false)
    }
  }

  // Add Member handler
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId || !newMemberName.trim()) return

    setIsAddingMember(true)
    setMemberFormError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })
      const data = (await res.json().catch(() => null)) as {
        id?: string
        homeId?: string
        name?: string
        error?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to add member')
      }
      setNewMemberName('')
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error adding member'
      setMemberFormError(message)
    } finally {
      setIsAddingMember(false)
    }
  }

  // Create Bill handler
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId) return

    const parsedCents = Number.parseInt(newBillCents, 10)
    if (!Number.isInteger(parsedCents) || parsedCents <= 0) {
      setBillFormError('Total cents must be a positive integer (e.g. 1000 for $10.00)')
      return
    }

    if (!newBillTitle.trim()) {
      setBillFormError('Bill title is required')
      return
    }

    setIsCreatingBill(true)
    setBillFormError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBillTitle.trim(),
          totalCents: parsedCents,
        }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create bill')
      }
      setNewBillTitle('')
      setNewBillCents('')
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error creating bill'
      setBillFormError(message)
    } finally {
      setIsCreatingBill(false)
    }
  }

  // Pay Share handler
  const handlePayShare = async (billId: string, shareId: string) => {
    setPayingShareId(shareId)
    setPaymentErrors((prev) => {
      const next = { ...prev }
      delete next[shareId]
      return next
    })

    const idempotencyKey = crypto.randomUUID()

    try {
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })
      const data = (await res.json().catch(() => null)) as {
        id?: string
        paidAt?: string
        error?: string
      } | null

      if (!res.ok) {
        throw new Error(data?.error || `Payment failed (${res.status})`)
      }

      // Update local state to reflect paid status
      setBills((prevBills) =>
        prevBills.map((b) => {
          if (b.id !== billId) return b
          return {
            ...b,
            shares: b.shares.map((s) => {
              if (s.id !== shareId) return s
              return { ...s, paidAt: data?.paidAt || new Date().toISOString() }
            }),
          }
        }),
      )

      // Refresh balances
      if (selectedHomeId) {
        const balRes = await fetch(`/api/homes/${selectedHomeId}/balances`)
        if (balRes.ok) {
          const balData = (await balRes.json()) as { balances: Balance[] }
          setBalances(balData.balances || [])
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment error'
      setPaymentErrors((prev) => ({ ...prev, [shareId]: message }))
    } finally {
      setPayingShareId(null)
    }
  }

  const selectedHome = homes.find((h) => h.id === selectedHomeId)

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 16px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: '#1f2937',
        backgroundColor: '#f9fafb',
        minHeight: '100vh',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#111827' }}>
            Shared Bill Splitter
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
            Equal & fair bill division with order-based remainder assignment
          </p>
        </div>

        {/* Home Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="home-select" style={{ fontSize: 14, fontWeight: 600 }}>
            Home:
          </label>
          <select
            id="home-select"
            value={selectedHomeId}
            onChange={(e) => setSelectedHomeId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontSize: 14,
              backgroundColor: '#ffffff',
            }}
          >
            {homes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Global Error Banner */}
      {pageError && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #f87171',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            <strong>Error:</strong> {pageError}
          </span>
          <button
            type="button"
            onClick={() => (selectedHomeId ? fetchHomeDetails(selectedHomeId) : fetchHomes())}
            style={{
              background: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Top Action Panels: Create Home & Add Member */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Create Home Card */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 20,
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h2 style={{ fontSize: 16, margin: '0 0 12px', fontWeight: 600 }}>Create New Home</h2>
          <form
            onSubmit={handleCreateHome}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <input
              type="text"
              placeholder="e.g. Sunset Apartments"
              value={newHomeName}
              onChange={(e) => setNewHomeName(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14,
              }}
            />
            {homeFormError && (
              <span style={{ color: '#dc2626', fontSize: 12 }}>{homeFormError}</span>
            )}
            <button
              type="submit"
              disabled={isCreatingHome || !newHomeName.trim()}
              style={{
                padding: '8px 14px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                cursor: isCreatingHome ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {isCreatingHome ? 'Creating...' : '+ Create Home'}
            </button>
          </form>
        </div>

        {/* Add Member Card */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 20,
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h2 style={{ fontSize: 16, margin: '0 0 12px', fontWeight: 600 }}>
            Add Member {selectedHome ? `to "${selectedHome.name}"` : ''}
          </h2>
          <form
            onSubmit={handleAddMember}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <input
              type="text"
              placeholder="e.g. Alex"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              disabled={!selectedHomeId}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14,
              }}
            />
            {memberFormError && (
              <span style={{ color: '#dc2626', fontSize: 12 }}>{memberFormError}</span>
            )}
            <button
              type="submit"
              disabled={isAddingMember || !newMemberName.trim() || !selectedHomeId}
              style={{
                padding: '8px 14px',
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                cursor: isAddingMember || !selectedHomeId ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {isAddingMember ? 'Adding...' : '+ Add Member'}
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}
        >
          <p style={{ color: '#6b7280', fontSize: 16 }}>Loading homes and bills...</p>
        </div>
      ) : !selectedHomeId ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}
        >
          <p style={{ color: '#6b7280', fontSize: 16 }}>
            No homes found. Create a home above to get started.
          </p>
        </div>
      ) : (
        <>
          {/* Members & Balances Summary */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              border: '1px solid #e5e7eb',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Home Members & Balances</h2>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                Priority order for extra remainder cents
              </span>
            </div>

            {members.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>
                No members in this home yet. Add members before creating bills.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                {members.map((m, idx) => {
                  const bal = balances.find((b) => b.memberId === m.id)
                  const owed = bal?.outstandingCents ?? 0
                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: 12,
                        borderRadius: 6,
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: '#6b7280',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        Member #{idx + 1}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                        {m.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          marginTop: 4,
                          color: owed > 0 ? '#b91c1c' : '#047857',
                          fontWeight: 600,
                        }}
                      >
                        Owes: {formatCents(owed)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Create Bill Section */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              border: '1px solid #e5e7eb',
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 18, margin: '0 0 16px', fontWeight: 700 }}>Add a Bill</h2>
            <form
              onSubmit={handleCreateBill}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <label
                    htmlFor="bill-title"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}
                  >
                    Bill Title
                  </label>
                  <input
                    id="bill-title"
                    type="text"
                    placeholder="e.g. WiFi, Groceries, Electricity"
                    value={newBillTitle}
                    onChange={(e) => setNewBillTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="bill-cents"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}
                  >
                    Total Amount in Cents (Integer)
                  </label>
                  <input
                    id="bill-cents"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 1000 (= $10.00)"
                    value={newBillCents}
                    onChange={(e) => setNewBillCents(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {billFormError && (
                <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 500 }}>
                  {billFormError}
                </div>
              )}

              <button
                type="submit"
                disabled={isCreatingBill || members.length === 0}
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 18px',
                  backgroundColor: members.length === 0 ? '#9ca3af' : '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: isCreatingBill || members.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {isCreatingBill
                  ? 'Splitting Bill...'
                  : members.length === 0
                    ? 'Add Members First'
                    : 'Split & Add Bill'}
              </button>
            </form>
          </div>

          {/* Bills List Section */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              border: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ fontSize: 18, margin: '0 0 16px', fontWeight: 700 }}>
              Bills ({bills.length})
            </h2>

            {bills.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: 6,
                  border: '1px dashed #d1d5db',
                }}
              >
                <p style={{ color: '#6b7280', margin: 0, fontSize: 15 }}>
                  No bills split yet for this home. Create one above!
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {bills.map((bill) => (
                  <div
                    key={bill.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      padding: 16,
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 12,
                        paddingBottom: 8,
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
                          {bill.title}
                        </h3>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Bill ID: {bill.id}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                        Total: {formatCents(bill.totalCents)}
                      </div>
                    </div>

                    {/* Shares Breakdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#4b5563',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        Individual Shares
                      </div>
                      {bill.shares.map((share) => {
                        const isPaid = share.paidAt !== null
                        const isPaying = payingShareId === share.id
                        const shareErr = paymentErrors[share.id]

                        return (
                          <div
                            key={share.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 8,
                              padding: '10px 14px',
                              borderRadius: 6,
                              backgroundColor: isPaid ? '#f0fdf4' : '#fffbeb',
                              border: `1px solid ${isPaid ? '#bbf7d0' : '#fef3c7'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontWeight: 600, fontSize: 14 }}>
                                {share.memberName || 'Member'}
                              </span>
                              <span style={{ fontSize: 14, color: '#374151' }}>
                                {formatCents(share.amountCents)}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {isPaid ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '4px 10px',
                                    borderRadius: 12,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    backgroundColor: '#dcfce7',
                                    color: '#15803d',
                                  }}
                                >
                                  ✓ Paid ({formatShortDate(share.paidAt)})
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handlePayShare(bill.id, share.id)}
                                  disabled={isPaying}
                                  style={{
                                    padding: '6px 14px',
                                    backgroundColor: '#0284c7',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: 6,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: isPaying ? 'not-allowed' : 'pointer',
                                    opacity: isPaying ? 0.7 : 1,
                                  }}
                                >
                                  {isPaying ? 'Processing...' : 'Pay Share'}
                                </button>
                              )}
                            </div>

                            {shareErr && (
                              <div
                                style={{
                                  width: '100%',
                                  marginTop: 4,
                                  fontSize: 12,
                                  color: '#b91c1c',
                                  fontWeight: 500,
                                }}
                              >
                                Payment failed: {shareErr} (share remains unpaid)
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
