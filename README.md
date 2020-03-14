# Make your own Vigibot.com raspberry PI robot

## Why this fork ?

1. Main project is quite hard to read, I'm trying to clean it a little bit so it can be extended !
2. Robots using main project are updated each time a commit is done in the repo. Robots that use this project will be updated based on stable releases.
3. Pull request are not very welcome in the main project. Feel free to contribute here :)

## Versions names

Release names are composed like: X.Y.Z

* X: Updated when there is a protocol change. **Update to this release is mandatory.**
* Y: Updated when there is a major change in the project. Update to this release is optionnal.
* Z: Updated when there is a minor change in the project. Update to this release is optionnal.

## Installation

1. Follow steps of the [main project](https://github.com/vigibot/vigiclient)
2. Override with ssh files in `/usr/local/vigiclient` with the last [release](https://github.com/pirquessa/vigiclient/releases) of this project
3. Update your robot config:
	* Edit your robot **Configuration matérielle**
	* Use **Config effective** tab
	* Switch editor mode to **Code**
	* Add/Edit the **PLUGINS** section with an array of your needed plugins. Eg: 
		* `"PLUGINS": [
	    "Safety",
	    "VideoDiffusion",
	    "AudioDiffusion"
	  ]`
4. Use new files:
	* Install new dependencies: `npm install`
	* Restart client: `systemctl restart vigiclient`

## Available plugins
| Plugin name | Description |
|--|--|
| Safety | **Mandatory**, it manage the safety of your robot: it will cut the motors if some lag appear |
| VideoDiffusion | **Mandatory**, it allow to display the video of the robot |
| AudioDiffusion | If you have a microphone on your robot, it can stream its audio feed |
| TextToSpeech | Allow your robot to speak when the user type something in the chat |
| SerialSlave | Allow to forward communication to a slave throw **serial** communication. Useful if you use an arduino paired with the Raspberry Pi. |
More to come, feel free to contribute !!!

## Customization with plugins
1. Create a plugin in the *plugins* folder. (Look at [SerialSlave.js](https://github.com/pirquessa/vigiclient/blob/master/plugins/SerialSlave.js) as exemple)
	* Your plugin class need to extend [AbstractPlugin] (https://github.com/pirquessa/vigiclient/blob/master/utils/AbstractPlugin.js)
	* Override the method you need
2. Declare your plugin in the **Configuration matérielle** of your robot, see installation instructions
3. Restart the client process (Can be done from the UI with icon ![enter image description here](https://www.vigibot.com/ihm/exit.png))
