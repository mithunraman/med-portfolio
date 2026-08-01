# Landing site — deploy runbook

`apps/landing` is a static site (plain HTML/CSS, no build step) served at
`https://logdit.app`.

Written after a partial deploy on 2026-08-01 left `index.html` live while
`privacy.html`, `terms.html` and `sub-processors.html` returned 404 — with the
homepage footer linking to all three. The mobile app links to the privacy and
terms pages from Settings, and the App Store listing carries the privacy URL, so
a partial deploy breaks an App Review requirement.

## Rules

1. **Deploy all pages together.** They cross-link, and `terms.html` and
   `index.html` now make interlocking claims about pricing. A half-deploy leaves
   contradictory statements live.
2. **Verify against the live URL, not the repo.** The 2026-08-01 incident was
   invisible locally — the files were correct on disk the whole time.

## Pages

| File | URL |
|---|---|
| `index.html` | https://logdit.app/ |
| `privacy.html` | https://logdit.app/privacy.html |
| `terms.html` | https://logdit.app/terms.html |
| `sub-processors.html` | https://logdit.app/sub-processors.html |
| `contact.html` | https://logdit.app/contact.html |

## Post-deploy verification

```bash
# 1. Every page resolves
for u in "" privacy.html terms.html sub-processors.html contact.html; do
  printf "%-45s " "https://logdit.app/$u"
  curl -s -o /dev/null -w "%{http_code}\n" -L --max-time 15 "https://logdit.app/$u"
done
# expect: 200 on all five

# 2. No phase language anywhere (App Store Guideline 2.2)
for p in "" terms.html privacy.html sub-processors.html contact.html; do
  printf "%-25s " "$p"
  curl -s -L --max-time 15 "https://logdit.app/$p" | grep -ciE "\bbeta\b|unstable|active development"
done
# expect: 0 on all five

# 3. Contract integrity — §10 cross-references §7, so §7 must still
#    contain an export statement
curl -s -L https://logdit.app/terms.html | grep -c "see section 7"   # expect 1
curl -s -L https://logdit.app/terms.html | grep -c "export your entries"  # expect >=1
```

Then, on a device: **Settings → Privacy & Support → Privacy Policy** and
**Terms of Use** must both open readable pages in the in-app browser. Those rows
are driven by `apps/mobile/src/constants/legal.ts`; if the URLs here ever change,
that file changes too.

## Claims that must stay consistent

`index.html` and `terms.html` state the same facts in different registers. If you
change one, check the other:

| Claim | Homepage | Terms |
|---|---|---|
| Currently free | "Is it free?" FAQ | §7 opening, §8 |
| Anything used free stays free | "Is it free?" FAQ | §8 |
| GP only for now | "Which specialties?" FAQ | §1 Eligibility |
| Notice before charging | "Is it free?" FAQ | §8 |

## Testimonials — hidden pending real feedback

The `<section class="testimonials">` block ("Portfolio time, minus the dread")
is commented out as of 2026-08-02. It carried three illustrative quotes and the
stat "45–60 min → 5 min", none of which could be evidenced — the app has had no
users. Testimonials must be genuine and documented (CAP Code; App Store Review
Guideline 2.3 on misleading metadata), and this page is linked from the listing.

The `.testimonials*` CSS is intentionally left in place so restoring is a single
uncomment. Before restoring, replace every quote, attribution and the stat with
real, consented feedback; the timing figure must be measured or reworded as a
design goal. Full instructions are in the TODO comment above the section.
