# Make your own Vigibot.com raspberry PI robot

## Why this fork ?

1. Main project is quite hard to read, I'm trying to clean it a little bit
    so it can be extended !
2. Robots are updated each time a commit is done in main repo. Robots that use this project will be updated based on code release.
3. Pull request are not very welcome in the main project. Feel free to contribute here :)

## Versions names

Release names are composed like: X.Y.Z
 * X: Updated when there is a protocol change. **Update to this release is mandatory.**
 * Y: Updated when there is a major change in the project. Update to this release is optionnal.
 * Z: Updated when there is a minor change in the project. Update to this release is optionnal.

## Installation

1. Follow steps of the [main
    project](https://github.com/vigibot/vigiclient)
2. Override with ssh files in /usr/local/vigiclient with the last code release of this project
3. Use new files:
	* Install new dependencies: `npm install`
	* Restart client: `systemctl restart vigiclient`
  
