# Obsidian Calendar Event Sync

This plugin is designed to quickly replace the title and initial content of the current note with your current, upcoming, or recent calendar event data.

## How it Works

When you run the `Sync with Event` command, we iterate through your calendar's event to find (in order of precedence):

-   The current event, if one is happening now.
-   The next upcoming event, if one is happening soon (time window customizable in settings).
-   The most recent event, if one happened recently (time window customizable in settings).

## Required Settings

-   `Calendar ICS URL`: This must be a valid calendar ICS URL that we can fetch your events from. The plugin currently only supports a single ICS URL as a source for event data.

## Optional Settings

-   `Show Notices`: You can determine whether or not notices show in Obsidian when events are synced.
-   `Calendar Owner Email`: Set this if you want events you've declined to be automatically excluded from the sync.
-   `Future Event Hour Limit`: What to consider an "upcoming" event.
-   `Recent Event Hour Limit`: What to consider a "recent" event.
-   `Ignored Event Titles`: A list of event titles to exclude from the sync. You can enter as many as you want, separated by newlines.
