# clearday

ClearDay: a calm, private quit counter on FreeAppStore — time since you quit, milestones, money
and time saved, fresh starts that keep your history, and a short journal. Everything stays on the
device (localStorage). Counters, money/time saved and milestone celebrations work (`web/src/counter.ts`, `savings.ts`,
`milestones.ts`); the rest is planned, see
freeappstore-online/platform#195.

- Live: https://clearday.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (vitest; time math is DST/zone-aware, keep it covered)
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- No medical claims in any copy. Help-resource links must be general, never an endorsement.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
