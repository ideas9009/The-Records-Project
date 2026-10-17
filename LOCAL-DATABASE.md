# Temporary local JSON database

The app starts fresh with Sumeitideas (operator, zero balance). Towns, jobs, companies, orders and financial history start empty. Basic settings and one local chat channel are seeded. Firebase is disconnected; the old database is untouched.

## File locations

- Windows desktop: %LOCALAPPDATA%\com.therecordsproject.nostra2\records.json. Settings displays the resolved location.
- Previous desktop save: records.backup.json in the same folder.
- Browser development: .local-data/development-records.json in this project.
- Browser production preview: .local-data/preview-records.json.
- Browser backups use the matching .backup.json filename. Browser test data is separate from desktop data.

## Saving and recovery

The file is created from data/database.seed.json only when absent. Changing the seed does not reset an existing database. Records persist across app restarts and builds. Saves replace the file atomically and retain the previous state as a backup; revision checks retry conflicting writes. Desktop processes also share a file lock.

Invalid files produce an error and are preserved. To restore a backup, close the app including tray/windows, keep a copy of the current file, and copy records.backup.json to records.json. Close the app before manually editing JSON, and preserve its schemaVersion, revision and documents structure. The single previous-save backup is not a historical archive.

## Connections

Discord bot syncing is paused; local chat stays on this computer. EarthMC live lookups and existing external image services remain online features. Wallpapers still come from the bundled wallpapers folder. No Firebase data export or migration was performed.

This temporary build has no login and uses Sumeitideas by default. A future hosted database and the upcoming new feature remain separate work.
