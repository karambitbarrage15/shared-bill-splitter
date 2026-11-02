import { Hono } from 'hono'

type HomeRow = {
  id: string
  name: string
}

type MemberRow = {
  id: string
  home_id: string
  name: string
  position: number
}

type BillRow = {
  id: string
  home_id: string
  title: string
  total_cents: number
}

type ShareRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

type BalanceRow = {
  memberId: string
  name: string
  outstandingCents: number
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.post('/api/homes', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'name is required' }, 422)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

app.get('/api/homes', async (c) => {
  const homes = await c.env.DB.prepare('SELECT id, name FROM homes').all<HomeRow>()
  return c.json({ homes: homes.results })
})

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'name is required' }, 422)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  const posRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM members WHERE home_id = ?',
  )
    .bind(homeId)
    .first<{ nextPos: number }>()

  const position = posRow?.nextPos ?? 1

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name, position) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, position)
    .run()

  return c.json({ id, homeId, name }, 201)
})

app.get('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  const members = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name FROM members WHERE home_id = ? ORDER BY position ASC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; name: string }>()

  return c.json({ members: members.results })
})

app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await c.req.json().catch(() => null)

  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    typeof body.totalCents !== 'number' ||
    !Number.isInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'total is not a positive whole number' }, 422)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  const membersRes = await c.env.DB.prepare(
    'SELECT id, name, position FROM members WHERE home_id = ? ORDER BY position ASC',
  )
    .bind(homeId)
    .all<MemberRow>()

  const members = membersRes.results
  if (members.length === 0) {
    return c.json({ error: 'home has no members' }, 422)
  }

  const title = body.title.trim()
  const totalCents = body.totalCents
  const billId = crypto.randomUUID()
  const memberCount = members.length

  const baseShare = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares: { id: string; memberId: string; amountCents: number; paidAt: null }[] = []
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(billId, homeId, title, totalCents),
  ]

  for (let i = 0; i < memberCount; i++) {
    const member = members[i]
    if (!member) continue
    const shareId = crypto.randomUUID()
    const amountCents = baseShare + (i < remainder ? 1 : 0)

    shares.push({
      id: shareId,
      memberId: member.id,
      amountCents,
      paidAt: null,
    })

    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents, paid_at, idempotency_key) VALUES (?, ?, ?, ?, NULL, NULL)',
      ).bind(shareId, billId, member.id, amountCents),
    )
  }

  await c.env.DB.batch(stmts)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  const billsRes = await c.env.DB.prepare(
    'SELECT id, home_id, title, total_cents FROM bills WHERE home_id = ?',
  )
    .bind(homeId)
    .all<BillRow>()

  const bills = []
  for (const b of billsRes.results) {
    const sharesRes = await c.env.DB.prepare(
      `SELECT s.id, s.member_id AS memberId, m.name AS memberName, s.amount_cents AS amountCents, s.paid_at AS paidAt
       FROM shares s
       JOIN members m ON m.id = s.member_id
       WHERE s.bill_id = ?
       ORDER BY m.position ASC`,
    )
      .bind(b.id)
      .all<{
        id: string
        memberId: string
        memberName: string
        amountCents: number
        paidAt: string | null
      }>()

    bills.push({
      id: b.id,
      homeId: b.home_id,
      title: b.title,
      totalCents: b.total_cents,
      shares: sharesRes.results,
    })
  }

  return c.json({ bills })
})

app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey?.trim()) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first<BillRow>()

  if (!bill) {
    return c.json({ error: 'bill not found' }, 404)
  }

  const share = await c.env.DB.prepare(
    'SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<ShareRow>()

  if (!share) {
    return c.json({ error: 'share not found' }, 404)
  }

  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json(
        {
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        },
        200,
      )
    }
    return c.json({ error: 'share already paid with a different key' }, 409)
  }

  const now = new Date().toISOString()
  const updateResult = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(now, idempotencyKey, shareId, billId)
    .run()

  if (updateResult.meta.changes === 1) {
    return c.json(
      {
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: now,
      },
      200,
    )
  }

  const latestShare = await c.env.DB.prepare(
    'SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<ShareRow>()

  if (latestShare && latestShare.idempotency_key === idempotencyKey) {
    return c.json(
      {
        id: latestShare.id,
        memberId: latestShare.member_id,
        amountCents: latestShare.amount_cents,
        paidAt: latestShare.paid_at,
      },
      200,
    )
  }

  return c.json({ error: 'share already paid with a different key' }, 409)
})

app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'home not found' }, 404)
  }

  const res = await c.env.DB.prepare(`
    SELECT
      m.id AS memberId,
      m.name AS name,
      COALESCE(SUM(
        CASE
          WHEN s.id IS NOT NULL AND b.id IS NOT NULL AND s.paid_at IS NULL THEN s.amount_cents
          ELSE 0
        END
      ), 0) AS outstandingCents
    FROM members m
    LEFT JOIN shares s ON s.member_id = m.id
    LEFT JOIN bills b ON b.id = s.bill_id AND b.home_id = m.home_id
    WHERE m.home_id = ?
    GROUP BY m.id, m.name, m.position
    ORDER BY m.position ASC
  `)
    .bind(homeId)
    .all<BalanceRow>()

  const balances = res.results.map((row) => ({
    memberId: row.memberId,
    name: row.name,
    outstandingCents: Number(row.outstandingCents),
  }))

  return c.json({ balances }, 200)
})

export default app
