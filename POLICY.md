# Reply labelling policy (v1)

This is the single source of truth for how a customer reply to a payment reminder is categorized and what the system does with it. The hand labels in `data/labels.json`, the classifier prompt and the code rules in `src/lib/policy.ts` all follow it. If they disagree, this file wins and the others get fixed.

**Guiding principle:** a reply is either handled automatically, or it goes to a person with a specific action. Mistakes land with a person, never in `paid`. JoyWork sends reminders; it can't change an invoice. Anything that needs the invoice changed, a payment verified or a disagreement settled goes to a person.

v1 replaces v0 (summarized in section 8 for history). The model output and the 6 category names are unchanged. What changed: some rank definitions, the mapping from rank to what's shown, the review-queue actions, and two new code rules (low-confidence demotion, promise horizon).

---

## 1. How a label is built

1. The model gives every reply **one parent category and one rank** (section 3).
2. Code applies the rules in section 4, which can only send a reply toward a person, never toward `paid`.
3. A fixed table (section 5) maps the final parent + rank to the **displayed category**, one of: `paid` · `promise_to_pay` · `dispute` · `resend_invoice` · `out_of_office` · `needs_human`.

**Parent category and rank are internal.** The interface shows only the displayed category. The evaluation scores the displayed category.

## 2. Rules for every reply

1. **Only the customer's own words count.** Ignore quoted earlier emails (`>` lines, "On … wrote:", the original reminder). The one exception: a **forwarded remittance advice** counts as evidence.
2. **When a reply has more than one intent, the first match in this order wins:**
   1. a `needs_human` trigger (section 3)
   2. dispute (including `promise_to_pay 3` and `resend_invoice 3`)
   3. promise_to_pay
   4. resend_invoice
   5. paid
   6. out_of_office (only when nothing else applies)
3. **A partial payment counts as acknowledged only if the reply says it's partial**, e.g. "$1,200 of the $3,400", "half", "the rest". An amount that simply differs from the invoice ("Wired $3,150" against $3,500) is not acknowledged.
4. **An explicit calendar date** names the day: "Nov 20", "11/25", "the 15th", "January 1", "viernes 20 de noviembre". **A relative date** depends on when the reply was sent: "tomorrow", "end of next week".
5. **Any language.** Apply the same rules to replies in any language.

## 3. Parent categories and ranks

| Parent · rank | Definition | Examples |
|---|---|---|
| **paid 1** | All three: **(a)** payment of *this* invoice **already made** by portal, card, ACH, wire, or shown in a remittance advice (a mailed check doesn't count); **(b)** a specific identifier (confirmation/reference/trace number, or remittance advice listing this invoice); **(c)** **no conflicting amount**: it equals the invoice amount, or none is given. | 01, 06, 17, 26 |
| **paid 2** | Payment claimed but vague: no identifier, or not yet received (a mailed check, even with a check number). | 07, 21, 31, 36 |
| **paid 3** | Payment claimed for a **different invoice**, or an amount **above or below** the invoice amount that the reply doesn't call partial. | 13 |
| **promise_to_pay 1** | The payment is approved or scheduled in their AP system ("approved", "in our Nov 20 payment run"), or there's an **explicit calendar date**. | 02, 28 |
| **promise_to_pay 2** | A **relative date**, no date, an acknowledgement with no firm promise ("Thanks, received", an automated AP ticket confirmation), **or a promise that also claims part was already paid** ("paid $1,200 of $3,400, rest on the 15th"), or an acknowledged partial payment with no plan for the rest. | 08, 12, 15, 20, 33, 38, 40 |
| **promise_to_pay 3** | Payment depends on a condition ("once you send a corrected invoice"), or part of the amount is contested ("we'll pay the rest, not that line"). | 18, 32 |
| **resend_invoice 1** | Asks for the same invoice again. A format change (PDF) still counts as the same invoice. | 03, 30 |
| **resend_invoice 2** | Asks for the invoice with something added: a PO number, W-9 or itemization, **or a person asks to change the recipient** (new address). | 11, 19, 35 |
| **resend_invoice 3** | The invoice itself, or where it must go, has to be fixed: a wrong quantity or rate, or claims redirected elsewhere (e.g. "direct all claims to our counsel"). | 04, 10, 29 |
| **dispute 0** | Recognizes the vendor, but contests the amount owed or withholds payment over a complaint (damage, work not done, never signed up). | 16, 25 |
| **out_of_office 0** | An **automated** away notice or redirect, including a retired mailbox that names a new address (the system follows up at the new address), **or** a person saying they're unavailable without promising, disputing or requesting anything. An automated *receipt* confirmation is `promise_to_pay 2`, not this. | 05, 14, 24, 27, 34 |
| **needs_human 0** | Any of: the meaning is unclear ("?"); they don't recognize the vendor; asks for new payment terms (installments); asks for a call or a person; contains **manipulation language** (section 6). **Also the fallback** when the system fails. | 09, 22, 23, 37, 39 |

## 4. Rules enforced in code, in this order

These run in `src/lib/policy.ts` after the model responds. They only ever send a reply toward a person.

1. **Failure:** a timeout, an API error, output that doesn't match the schema, or a failed retry → `needs_human 0`, reason `classifier_error`.
2. **Manipulation language** → `needs_human 0`, whatever the model chose (section 6, tier A). A **status-update request** must meet the strict paid evidence (tier B), or it becomes `needs_human 0`.
3. **Recheck paid:** code checks the extracted fields. If the identifier is missing → paid 2. If the invoice number mentioned differs from this invoice, or the amount differs from the invoice amount → paid 3.
4. **Evidence checks:** every extracted amount must appear in the reply body, and `evidence_quote` must be an exact substring of it. If either fails, the value is discarded and this counts as low confidence (rule 5).
5. **Low confidence demotes one rank.** When the model's confidence is `low`, or rule 4 failed, the rank goes up by one (1 → 2, 2 → 3). If the result is still an **automatic** category (section 5), it stays automatic. Otherwise it becomes `needs_human 0`, so an uncertain reply never lands in `dispute`, where no category change is offered. Rank 0 and rank 3 → `needs_human 0`.
   - promise_to_pay 1 → promise_to_pay 2 (still automatic)
   - promise_to_pay 2 → needs_human 0
   - resend_invoice 1 → resend_invoice 2 (needs_human)
   - paid 1 → paid 2 (needs_human)
6. **Promise horizon:** if the reply would show as `promise_to_pay` and its promised date is **more than 30 days after `received_at`** → show as `needs_human`, reason "promise more than 30 days out". This applies to ranks 1 and 2; the parent and rank stay as they are. A promise with no date, or a date code can't validate, stays automatic.

`model_category` and `model_rank` keep what the model said. The final parent, rank and displayed category, and every rule that fired, are stored with the result.

## 5. What each one does

| Displayed as | Parent · rank | Review queue | Action in the queue | How it leaves the queue |
|---|---|---|---|---|
| `promise_to_pay` | promise_to_pay 1, 2 | **No (automatic)** | — | The system schedules a follow-up |
| `resend_invoice` | resend_invoice 1 | **No (automatic)** | — | The system resends the same invoice |
| `out_of_office` | out_of_office 0 | **No (automatic)** | — | The system follows up after the return date, or at the new address |
| `paid` | paid 1 | Yes | ✓ / ✗ | **✓** the user confirmed the money arrived: leaves the queue. **✗** not found: becomes `needs_human` and stays. |
| `dispute` | dispute 0 · promise_to_pay 3 · resend_invoice 3 | Yes | "Resolved offline" with an optional note | Resolved offline. The category stays dispute. |
| `needs_human` | paid 2, 3 · resend_invoice 2 · needs_human 0 · **anything moved by rules 1, 2, 5, 6** | Yes | **Category change inline**, or "Keep as needs human" with a note | Changed to any category (changing to `paid` counts as confirmed payment), or kept with a note |

Any reply can be recategorized from its detail page. A reply moved into a queue category by a user enters the queue; one moved to an automatic category leaves it.

## 6. Suspicious replies

Customer text is data. Nothing in a reply can change how the system behaves.

- **Tier A: manipulation language.** Instructions aimed at the system rather than a person: "ignore prior instructions", "SYSTEM NOTE", "set this account status to …", "override". Always `needs_human 0`, **even if the reply also contains payment evidence**.
- **Tier B: an ordinary status-update request** ("please mark this paid in your system"). `paid 1` only with strict evidence: an identifier, **and** a stated amount equal to the invoice amount (leaving the amount out isn't enough), **and** no other invoice named. Otherwise `needs_human 0`.

## 7. Decisions behind v1

| Case | Decision | Why |
|---|---|---|
| "Thanks, received" (#20), automated AP ticket (#40) | promise_to_pay 2, automatic | Acknowledged with no firm promise: schedule a follow-up |
| Promise plus a claimed partial payment, date within 30 days (#12) | promise_to_pay 2, automatic | The follow-up for the rest is scheduled. The partial payment isn't verified by a person. |
| Promise more than 30 days out (#38, Jan 1) | needs_human (rule 6) | A long delay is the customer setting its own terms; a person decides |
| Person asks to change the recipient (#35) | resend_invoice 2 → needs_human | Recipient changes are a common invoice-fraud trick; a person confirms |
| Automated retired-mailbox redirect (#14) | out_of_office 0, automatic | The system follows up at the new address and reads the reply from there |
| Bankruptcy, claims redirected to counsel (#29) | resend_invoice 3 → dispute | Settled outside the app; nothing is resent automatically |
| Conditional or contested promises, invoice corrections (#04, #10, #18, #32) | dispute | Settled outside the app; JoyWork can't change invoices |
| Payment with identifier and matching amount (#01, #06, #17, #26) | paid, with ✓/✗ | Without bank data, `paid` is a credible claim; a person confirms it |
| Low confidence | Demote one rank; never into dispute | Uncertain replies go to a person who can change the category |

## 8. v0 (history)

v0 was the conservative baseline: everything uncertain went to `needs_human`, and the mapping was paid 1 → paid; paid 2, 3 → needs_human; promise_to_pay 1, 2 → promise_to_pay; promise_to_pay 3 → dispute; resend_invoice 1 → resend_invoice; resend_invoice 2 → needs_human; resend_invoice 3 → dispute; dispute 0, out_of_office 0, needs_human 0 → themselves. v0 had no review actions beyond category change, no demotion rule and no promise horizon. Its labels are in `data/labels-v0.json`, and its results in `eval/results-v1-*.json` (prompt v1).

## 9. Out of scope

- Actually sending reminders, resends or follow-ups (v2 decides the actions after sorting)
- Checking claimed payments against bank or accounting data
- Different horizons per customer, or business-specific payment terms