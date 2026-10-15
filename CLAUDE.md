# clearday

ClearDay: a calm, private quit counter on FreeAppStore — time since you quit, milestones, money
and time saved, fresh starts that keep your history, and a short journal. Everything stays on the
device (localStorage). All of v1 is built (freeappstore-online/platform#195): counters
(`web/src/counter.ts`), savings, milestones, fresh starts and journal (`history.ts`), PIN lock
(`pin.ts`), backup/restore (`backup.ts`) and the privacy note (`Privacy.tsx`).

- Live: https://clearday.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (vitest; time math is DST/zone-aware, keep it covered)
- E2E: `pnpm e2e` (Playwright, Chromium; first run `pnpm exec playwright install chromium`)
- Check: `fas check` and `fas screencheck` (on Windows: `pnpm build` then `fas screencheck --skip-build`)
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- No medical claims in any copy (e2e checks every screen). Help-resource links must be general,
  never an endorsement.
- The privacy note must match what actually loads: the platform analytics script (page views only)
  and the Cloudflare Web Analytics beacon the host adds. Update it if either changes.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
