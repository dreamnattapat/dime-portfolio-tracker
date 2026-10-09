/**
 * Pulls new Dime! emails from Gmail into the local database.
 * The browser version of dime-auto-log-transactions/src/main.py.
 *
 * An email counts as processed only once its rows are saved, so a failure
 * (network, odd PDF) is retried on the next sync, as in the Python version.
 * Emails whose PDF couldn't be parsed are retried too, so a parser fix takes
 * effect on the next sync without clearing anything.
 */
import { db, type Transaction } from '@/lib/db'
import { parseFields } from '@/lib/dime/parser'
import { fetchPdfAttachment, findDimeMessageIds } from '@/lib/google/gmail'
import { extractText, WrongPasswordError } from '@/lib/pdf'

export type SyncProgress = {
  total: number
  done: number
  added: number
  failed: number
  /** Why the first failed email failed, so the user has something to report. */
  firstError?: string
}

// Parallel email downloads; small enough to stay well inside Gmail's rate limits.
const CONCURRENCY = 4

export async function syncFromGmail(
  accessToken: string,
  pdfPassword: string,
  onProgress: (progress: SyncProgress) => void,
): Promise<SyncProgress> {
  const allIds = await findDimeMessageIds(accessToken)
  const processed = new Set(await db.processedMessages.toCollection().primaryKeys())
  const unparsed = await db.transactions.filter((tx) => tx.parseStatus === 'unparsed').toArray()
  const retry = new Set(unparsed.map((tx) => tx.gmailMessageId))
  const newIds = allIds.filter((id) => !processed.has(id) || retry.has(id))

  const progress: SyncProgress = { total: newIds.length, done: 0, added: 0, failed: 0 }
  onProgress({ ...progress })

  let wrongPassword: WrongPasswordError | null = null

  async function processOne(messageId: string) {
    try {
      const email = await fetchPdfAttachment(accessToken, messageId)
      const rows: Transaction[] = []
      if (email) {
        const text = await extractText(email.pdfBytes, pdfPassword)
        const receivedAt = new Date(email.internalDateMs).toISOString()
        parseFields(text).forEach((parsed, index) => {
          rows.push({ ...parsed, id: `${messageId}:${index}`, gmailMessageId: messageId, receivedAt })
        })
      }
      // An email without a PDF is marked processed too, so it's skipped next time.
      await db.transaction('rw', db.transactions, db.processedMessages, async () => {
        // Replace rows from an earlier attempt (e.g. an unparsed placeholder).
        await db.transactions.where('gmailMessageId').equals(messageId).delete()
        await db.transactions.bulkPut(rows)
        await db.processedMessages.put({ id: messageId, processedAt: new Date().toISOString() })
      })
      if (email) progress.added++
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        wrongPassword = error
        return
      }
      console.error(`Failed to process message ${messageId}`, error)
      progress.failed++
      progress.firstError ??= error instanceof Error ? error.message : String(error)
    } finally {
      progress.done++
      onProgress({ ...progress })
    }
  }

  const queue = [...newIds]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      // A wrong birthdate will fail on every email, so stop at the first one.
      while (queue.length && !wrongPassword) await processOne(queue.shift()!)
    }),
  )

  if (wrongPassword) throw wrongPassword
  return progress
}
