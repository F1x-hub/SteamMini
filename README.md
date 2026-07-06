# SteamMini

Steam-client with achievements, card farming, and regional price comparison.

## Changelog

### [1.0.3]

### Features
- Add user data export and import feature (.steammini-backup) for Windows migrations
- Add backup and restore options to Settings page UI
- Add percentage comparison to regional prices with up/down SVG arrows
- Add Finland (EUR) to comparison regions
- Add wishlist multi-region filter panel with multiselect (US, RU, KZ, TR, AR, UA, GE, PL, FI)
- Add wishlist percentage threshold filter to hide out-of-range priced games
- Add wishlist region price badges on each card with % diff vs US price
- Add wishlist sort option by minimum region price
- Hide unavailable games in selected regions from wishlist
- Add real-time UI updates for wishlist region price badges as they load

### Fixes
- Fix top-nav timing bug preventing wallet balance display
- Migrate wallet balance parser to Steam JSON userdata API with HTML fallback
- Fix HTTP 429 rate limiting by adding 5s delay between region price fetches
- Fix currency-agnostic price comparison using real-time USD exchange rates for accurate threshold filtering


