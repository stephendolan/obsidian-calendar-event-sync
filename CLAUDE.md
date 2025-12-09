# CLAUDE.md

Obsidian plugin that syncs calendar events from ICS feeds to notes. Updates note titles with event dates and prepends attendee lists.

## Architecture

Small codebase (~700 LOC) with 4 modules:

**src/main.ts** - Plugin entry point. Registers commands "Sync with closest event" and "Select event to sync". Handles note updates via `syncNoteWithEvent()`.

**src/calendar.ts** - Business logic. `CalendarEvent` wraps node-ical VEvent with filtering (`isAttending()`, `isIgnored()`, `isCancelled()`) and formatting (`generateTitle()`, `generateAttendeesListMarkdown()`). `CalendarService` fetches ICS feeds, expands recurring events with rrule, and implements `findClosestEvent()` priority logic.

**src/interface.ts** - `EventChoiceModal` for manual event selection.

**src/settings.ts** - `PluginSettings` interface and `SettingTab` UI.

## Event Selection Logic

`findClosestEvent()` priority: (1) currently occurring, (2) upcoming within `eventFutureHourLimit` hours, (3) recently ended within `eventRecentHourLimit` hours. Excludes declined, ignored, and cancelled events.

## Commands

```bash
npm run dev          # Development build with watch
npm run build        # Production build (type check + esbuild)
npm test             # Run tests
npm run test:watch   # Watch mode
```

## Releasing

```bash
npm version patch && git push && git push --tags  # 2.1.0 → 2.1.1
npm version minor && git push && git push --tags  # 2.1.0 → 2.2.0
npm version major && git push && git push --tags  # 2.1.0 → 3.0.0
```

This updates all version files, creates a commit and tag, and triggers GitHub Actions to build a draft release.

**After the draft is created**, review commits since the last release and publish with notes:

```bash
git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --oneline  # See what's in the release
gh release edit <version> --draft=false --notes "$(cat <<'EOF'
## Fixed
- Description of fix

## Added
- Description of new feature

## Changed
- Description of change
EOF
)"
```

Release notes format (match existing releases):
- Use `## Fixed`, `## Added`, `## Changed` sections as needed
- Keep descriptions concise (one line each)
- For major releases, add a `## Summary` section at the top
- Omit sections with no changes

## Testing

Use fixed dates in tests since event selection is time-dependent. Recurring event tests should cover EXDATE exceptions and modified occurrences. Attendee data format varies by calendar provider.

## Development Patterns

**Adding a setting**: Add property to `PluginSettings`, add default to `DEFAULT_SETTINGS`, add UI in `SettingTab.display()`.

**Changing event filtering**: Update `CalendarEvent` predicate methods, then update `findClosestEvent()` or `getSelectableEvents()` filters.

**Changing note format**: Modify `generateTitle()` for filename, `generateAttendeesListMarkdown()` for content, `syncNoteWithEvent()` for insertion.

## Code Style

Implement exactly what's requested. Keep changes minimal - this is a small plugin that should stay simple. Use `new Notice()` for user feedback with actionable messages like "Make sure your ICS URL is correct".
