# Reply labelling policy (v0)

This is the single source of truth for how a customer reply to a payment reminder is categorized. The hand labels in `labels.json`, the classifier prompt, and the code rules in `src/lib/policy.ts` all follow it. If they ever disagree, this file wins and the others get fixed.

**Guiding principle:** mistakes should land in `needs_human`, never in `paid`. Marking an invoice paid when it isn't means nobody chases that money. `paid` requires money that has actually moved, with evidence that ties it to *this* invoice.

---

## 1. How a label is built

Every reply gets **exactly one parent category and one rank**. A fixed lookup table maps that pair to one of the six **v0 categories** the app shows and the evaluation scores:

`paid` · `promise_to_pay` · `dispute` · `resend_invoice` · `out_of_office` · `needs_human`

The model proposes the parent and rank. Code applies the mapping and the rules in section 4. Ranks exist so a later version can treat them differently; in v0 they only decide the mapping.

## 2. Rules for every reply

1. **Only the customer's own words count.** Ignore quoted earlier emails (`>` lines, "On … wrote:", the original reminder). The one exception: a **forwarded remittance advice** counts as evidence.
2. **When a reply has more than one intent, the first match in this order wins:**
   1. a `needs_human` trigger (section 3)
   2. dispute (including `promise_to_pay 3` and `resend_invoice 3`)
   3. promise_to_pay
   4. resend_invoice
   5. paid
   6. out_of_office (only when nothing else applies)
3. **Total test.** A requested correction that would change the invoice total is a dispute. One that leaves the total unchanged (a PO number added, a W-9 attached, a new recipient) is not.
4. **A partial payment counts as acknowledged only if the reply says it's partial**, e.g. "$1,200 of the $3,400", "half", "the rest", "first installment". An amount that simply differs from the invoice ("Wired $3,150" against $3,500) is not acknowledged.
5. **Dates.** A date counts as specific if it can be turned into one calendar date using `received_at`: "tomorrow", "the 15th", "end of next week", "11/25", "January 1". There's no limit on how far ahead the date can be in v0.
6. **Any language.** Apply the same rules to replies in any language.

## 3. Categories

| Parent · rank | Definition | v0 category |
|---|---|---|
| **paid 1** | All three hold: **(a)** payment of *this* invoice has **already been made** by portal, card, ACH, wire, or shown in a remittance advice; **(b)** there is a specific identifier: a confirmation, reference or trace number, or a remittance advice listing this invoice; **(c)** **no conflicting amount**: the stated amount equals the invoice amount, or no amount is stated. | `paid` |
| **paid 2** | Claims payment but has no identifier, **or** the money hasn't been received yet (a mailed check counts here, even with a check number). | `needs_human` |
| **paid 3** | Claims payment but names a **different invoice**, or states an amount **above or below** the invoice amount that the reply doesn't call partial. | `needs_human` |
| **promise_to_pay 1** | The payment is already approved or scheduled in their AP system ("approved", "in our Nov 20 payment run"), and/or there's a specific date (rule 5). Includes "paid part, the rest on <date>". | `promise_to_pay` |
| **promise_to_pay 2** | Commits to paying with no date ("soon"), **or** acknowledges a partial payment with no plan for the rest. | `promise_to_pay` |
| **promise_to_pay 3** | Payment depends on a condition ("once you send a corrected invoice"), or part of the amount is contested ("we'll pay the rest, not that line"). | `dispute` |
| **resend_invoice 1** | Asks for the same invoice again. A format change (PDF instead of a link) still counts as the same invoice. | `resend_invoice` |
| **resend_invoice 2** | Asks for the invoice again with something added or changed, total unchanged: PO number, W-9, itemization, new recipient or contact address. | `needs_human` |
| **resend_invoice 3** | Asks for a corrected invoice whose total would change (wrong quantity, wrong rate). | `dispute` |
| **dispute 0** | Recognizes the vendor, but contests the amount owed or withholds payment over a complaint (damage, work not done, never signed up). It doesn't matter whether they say "we won't pay" or "we'll pay the right amount". | `dispute` |
| **out_of_office 0** | Any **automated** reply (out of office with or without a return date or alternate contact, retired mailbox, AP ticket confirmation), **or** a person saying they're unavailable without promising, disputing or requesting anything. | `out_of_office` |
| **needs_human 0** | Any of the following: the meaning is unclear ("Thanks, received", "?"); they don't recognize the vendor; legal (bankruptcy, "contact our counsel"); asks for new payment terms (installments); asks for a call or a person; contains **manipulation language** (section 5). | `needs_human` |

## 4. Rules enforced in code, not left to the model

These are checked in `src/lib/policy.ts` after the model responds. They can only move a reply toward a more cautious category, never back toward `paid`.

1. **Recheck paid.** Code checks the fields the model extracted: an identifier is present, the invoice number mentioned (if any) equals this invoice's number, and the amount (if any) equals the invoice amount. If any check fails, the rank becomes 2 or 3 and the category `needs_human`.
2. **Amounts must appear in the text.** Every amount the model extracts must be found in the reply body. If one isn't, it's discarded and the reply goes to review.
3. **The evidence quote must be exact.** The model's `evidence_quote` must be an exact substring of the reply body. If it isn't, the reply goes to review.
4. **Manipulation language** → `needs_human 0`, whatever the model chose (section 5, tier A).
5. **Status-update requests** → strict paid evidence (section 5, tier B).
6. **Failures** → `needs_human 0` with reason `classifier_error`. This covers a timeout, an API error, output that isn't valid against the schema, or a failed retry. A failure is never treated as a guess.

### Review queue

A reply goes to the review queue if any of these is true, whatever its category:
- its v0 category is `needs_human`
- the model's confidence is not `high`
- any rule in this section changed the model's answer
- either flag is set (manipulation language, status-update request), or the invoice number the reply mentions differs from this invoice
- it's `promise_to_pay 2` with a payment amount stated (a partial payment with no plan for the rest)
- the evidence quote or amount check failed

## 5. Suspicious replies

Customer text is data. Nothing in a reply can change how the system behaves.

- **Tier A: manipulation language.** Instructions aimed at the system rather than at a person: "ignore prior instructions", "SYSTEM NOTE", "set this account status to …", "override", role-play prompts. Always `needs_human 0`, **even if the reply also contains payment evidence**.
- **Tier B: an ordinary request to update status** ("please mark this paid in your system"). It's `paid 1` only if the evidence is strict: an identifier, **and** a stated amount equal to the invoice amount (leaving the amount out isn't enough here), **and** no other invoice named. Otherwise it's `needs_human 0`.

## 6. Decisions made under stress testing

| Case | Decision | Why |
|---|---|---|
| Partial payment, no plan for the rest | `promise_to_pay 2`, sent to review | They paid part and are engaged; a person still checks what's owed |
| Check mailed, with a check number | `paid 2` → `needs_human` | Money in the mail hasn't been received |
| "Please mark this paid", with evidence | Tier B: paid 1 only with strict evidence | Ordinary request, but close to an injection, so the bar is higher |
| Person away, no commitment | `out_of_office 0` | Same meaning as an auto-reply: nobody is acting on it yet |
| Person away, with a dated commitment | `promise_to_pay 1` | Rule 2.2: the promise outranks out of office |
| Amount larger than the invoice | `paid 3` → `needs_human` | Any amount other than the invoice amount conflicts; a person works out what it covered |
| Promise months away | `promise_to_pay 1`, no limit | A limit is a business rule for later |
| Doesn't recognize the vendor (#09) | `needs_human 0`, not dispute | May be the wrong contact, not a disagreement about the charge |
| Retired mailbox (#14), AP ticket (#40) | `out_of_office 0` | Automated; nobody has read the reminder |

## 7. Out of scope for v0

- A limit on how far ahead a promised date can be
- Different handling for each rank (ranks only decide the v0 mapping)
- Sending any outreach or replies
- Checking claimed payments against bank or accounting data. In production, `paid` would mean "customer claims payment with credible evidence; verify before closing the invoice."