# Obsidian Calendar Event Sync

This plugin is designed to quickly replace the title and initial content of the current note with your current, upcoming, or recent calendar event data.

## How it Works

When you run the `Sync with closest event` command, we iterate through your calendar's event to find (in order of precedence):

-   The current event, if one is happening now.
-   The next upcoming event, if one is happening soon (time window customizable in settings).
-   The most recent event, if one happened recently (time window customizable in settings).

When you run the `Select event to sync` command, we show you a list of past, occurring, and future events to select from.

## Required Settings

-   `Calendar ICS URL`: This must be a valid calendar ICS URL that we can fetch your events from. The plugin currently only supports a single ICS URL as a source for event data.

## Optional Settings

-   `Calendar Owner Email`: Set this if you want events you've declined to be automatically excluded from the sync.
-   `Ignored Event Titles`: A list of event titles to exclude from the sync. You can enter as many as you want, separated by newlines.
-   `Quick sync - Past limit (hours)`: How many hours in the past to consider an event as "recent" when using the quick sync command (default: 2).
-   `Quick sync - Future limit (hours)`: How many hours in the future to consider an event as "upcoming" when using the quick sync command (default: 4).
-   `Select modal - Past limit (days)`: How many days in the past to show events in the selection modal (default: 1).
-   `Select modal - Future limit (days)`: How many days in the future to show events in the selection modal (default: 3).
