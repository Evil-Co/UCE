/*!
 * jQuery UNIX Console Emulator Plugin
 * Copyright 2011, Johannes Donath
 * Licensed under the GNU Lesser Public License
*/

(function(jQuery){
	var terminal = {
			/**
			 * Contains settings for our plugin
			 */
			settings					:		{
				'callbackUrl'						:	'terminal.php',
				'callbackParameter'					:	'command',
				'backgroundColor'					:	'#000000',
				'foregroundColor'					:	'#008000',
				'consoleContentID'					:	'consoleContent',
				'consoleInputLineID'				:	'consoleInputLine',
				'consoleInputLineWrapperID'			:	'consoleInputLineWrapper',
				'consoleCursorID'					:	'consoleCursor',
				'ps1ContainerID'					:	'consolePS1',
				'PS1'								:	'<span style="color: #ff3333">Terminal</span>:~#&nbsp;',
				'cursorBlinkRate'					:	500,
				'generalErrorMessage'				:	'<span style="color: #ff3333"><b>An error occoured! Please try again later!</b></span><br />',
				'cursorBlinkTimeout'				:	500
			},
	
			/**
			 * Contains the element where we'll store our command output
			 */
			consoleContent				:		null,
			
			/**
			 * Contains the element wich contains the current command line input (Without PS1)
			 */
			consoleInputLine			:		null,
			
			/**
			 * Contains the cursor element
			 */
			consoleCursor				:		null,
			
			/**
			 * If this is set to true the cursor will NOT blink
			 */
			disableCursorBlink			:		false,
			
			/**
			 * Contains the position where cursor is currently
			 */
			cursorPosition				:		0,
			
			/**
			 * Contains the input buffer
			 */
			consoleInputBuffer			:		'',
			
			/**
			 * Contains a history of commands
			 */
			commandHistory				:		[],
			
			/**
			 * Contains false if the command isn't ready yet
			 */
			consoleIsReady				:		true,
			
			/**
			 * Contains the unix timestamp of last cursor position change
			 */
			lastCursorPositionChange	:		0,
			
			/**
			 * Special key handling ...
			 */
			sticky						: {
				/**
				 * Contains special keys and their current states
				 */
				keys		:		{
					ctrl		:		false,
					alt			:		false
				},

				/**
				 * Sets a new state
				 */
				set			:		function(key, state) {
					this.keys[key] = state;
				},

				/**
				 * Toggles a state
				 */
				toggle		:		function(key) {
					this.set(key, !this.keys[key]);
				},

				/**
				 * Resets the state
				 */
				reset		:		function(key) {
						this.set(key, false);
				},

				/**
				 * Resets all states
				 */
				resetAll	:		function(key) {
					$.each(this.keys, $.proxy(function(name, value) {
						this.reset(name);
					}, this));
				}
			},
			
			/**
			 * Initial method
			 */
			init						:		function(options) {
				// parse settings
				$.extend(terminal.settings, options);
				
				// clear container
				this.html('');
				
				// update css
				this.css('background-color',	terminal.settings.backgroundColor)
					.css('color',				terminal.settings.foregroundColor);
				
				// create elements
				this.html(	'<span id="' + terminal.settings.consoleContentID + '"></span> \
							 <span id="' + terminal.settings.consoleInputLineWrapperID + '">\
									<span id="' + terminal.settings.ps1ContainerID + '">' + terminal.settings.PS1 + '</span> \
									<span id="' + terminal.settings.consoleInputLineID + '"></span>\
							 </span>');
				
				// get elements
				terminal.consoleContent = $('#' + terminal.settings.consoleContentID);
				terminal.consoleInputLine = $('#' + terminal.settings.consoleInputLineID);
				
				// rebuild input line
				terminal.rebuildInputLine.call(this);
				
				// start cursor blink
				terminal.cursorBlink.call(this);
				
				terminal.initBinds.call(this);
			},
			
			/**
			 * Binds all events
			 */
			initBinds					:		function() {
				// kill operas defaults
				document.onkeydown = document.onkeypress = function(e) { return $.hotkeys.specialKeys[e.keyCode] != 'backspace'; }; 
				
				// add listener
				$(document).keypress(
					$.proxy(function(e) {
						if (this.isReady()) {
							if (e.which >= 32 && e.which <= 126) {
								var character = String.fromCharCode(e.which);
								var letter = character.toLowerCase();
							} else {
									return;
							}
							
							if ($.browser.opera && !(/[\w\s]/.test(character))) return;
							
							// add character
							if (character) {
									this.appendCharacter(character);
									e.preventDefault();
							}
						}
					}, terminal)
				).bind('keydown', 'return',
					$.proxy(function(e) {
						if (this.isReady()) this.sendCommand();
						e.preventDefault();
					}, terminal)
				).bind('keydown', 'backspace',
					$.proxy(function(e) {
						if (this.isReady()) this.removeCharacter();
						e.preventDefault();
					}, terminal)
				).bind('keydown', 'tab',
					$.proxy(function(e) {
						e.preventDefault();
					}, terminal)
				).keyup(
					$.proxy(function(e) {
						var keyName = $.hotkeys.specialKeys[e.which];
						
						if (keyName in {'ctrl':true, 'alt':true}) {
							this.sticky.toggle(keyName);
						} else if (!(keyName in {'left':true, 'right':true, 'up':true, 'down':true})) {
							this.sticky.resetAll();
						}
					}, terminal)
				); 
			},
			
			/**
			 * Rebuilds the whole input line
			 */
			rebuildInputLine			:		function() {
				var consoleContent = terminal.consoleInputBuffer;
				var firstConsoleContentPart = consoleContent.substr(0, terminal.cursorPosition);
				var secondConsoleContentPart = (consoleContent.length > terminal.cursorPosition ? consoleContent.substr(terminal.cursorPosition) : '');
				var consoleContent = firstConsoleContentPart + '<span id="' + terminal.settings.consoleCursorID + '" style="background-color: ' + terminal.settings.foregroundColor + '">&nbsp;&nbsp;&nbsp;</span>' + secondConsoleContentPart;
				
				terminal.consoleInputLine.html(consoleContent);
				
				terminal.consoleCursor = $('#' + terminal.settings.consoleCursorID);
			},
			
			/**
			 * Appends a new character to input
			 * @param		string			character
			 */
			appendCharacter				:		function(character) {
				var consoleContent = terminal.consoleInputBuffer;
				var firstConsoleContentPart = consoleContent.substr(0, terminal.cursorPosition);
				var secondConsoleContentPart = (consoleContent.length > terminal.cursorPosition ? consoleContent.substr(terminal.cursorPosition) : '');
				
				terminal.consoleInputBuffer = firstConsoleContentPart + character + secondConsoleContentPart;
				
				terminal.changeCursorPosition(terminal.cursorPosition + 1);
			},
			
			/**
			 * Removes a character from input
			 */
			removeCharacter				:		function() {
				var consoleContent = terminal.consoleInputBuffer;
				var firstConsoleContentPart = consoleContent.substr(0, terminal.cursorPosition);
				var secondConsoleContentPart = (consoleContent.length > terminal.cursorPosition ? consoleContent.substr(terminal.cursorPosition) : '');
				
				firstConsoleContentPart = firstConsoleContentPart.substr(0, (firstConsoleContentPart.length - 1));
				terminal.consoleInputBuffer = firstConsoleContentPart + secondConsoleContentPart;
				
				terminal.changeCursorPosition(terminal.cursorPosition - 1);
			},
			
			sendCommand					:		function() {
				// catch empty commands
				if (terminal.consoleInputBuffer.match(/^(\s+)$/) || terminal.consoleInputBuffer == '') {
					this.consoleInputBuffer = '';
					this.cursorPosition = 0;
					this.consoleContent.append(this.buildInputLogLine());
					this.rebuildInputLine();
					return;
				}
				
				terminal.consoleIsReady = false;
				
				terminal.commandHistory.push(terminal.consoleInputBuffer);
				
				$.ajax({
					url			:		terminal.settings.callbackUrl,
					type		:		'post',
					data		:		terminal.settings.callbackParameter + '=' + escape(terminal.consoleInputBuffer),
					beforeSend	:		$.proxy(function() {
						this.consoleContent.append(this.buildInputLogLine());
						this.consoleInputBuffer = '';
						this.cursorPosition = 0;
						this.consoleInputLine.html('');
					}, terminal),
					success		:		$.proxy(function(data) {
						this.consoleContent.append(data);
						this.rebuildInputLine();
						terminal.consoleIsReady = true;
					}, terminal),
					error		:		$.proxy(function() {
						this.consoleContent.append(this.settings.generalErrorMessage);
						this.rebuildInputLine();
						terminal.consoleIsReady = true;
					}, terminal)
				});
			},
			
			/**
			 * Builds the input line for logging in terminal content
			 * @returns {String}
			 */
			buildInputLogLine			:		function() {
				return '<span class="terminalMessage">' + terminal.settings.PS1 + '<span class="terminalMessageContent">' + terminal.consoleInputBuffer + '<br /></span></span>';
			},
			
			/**
			 * Returnes true if the console is ready
			 * @returns		boolean
			 */
			isReady						:		function() {
				return terminal.consoleIsReady;
			},
			
			/**
			 * Changes the cursor position to new value
			 * @param		integer		newPosition
			 */
			changeCursorPosition		:		function(newPosition) {
				terminal.lastCursorPositionChange = (new Date).getTime();
				terminal.cursorPosition = newPosition;
				terminal.rebuildInputLine();
			},
			
			/**
			 * Toggles the cursor
			 */
			cursorBlink					:		function() {
				if (!terminal.isCursorBlinkDisabled() || terminal.consoleCursor.is(':hidden')) terminal.consoleCursor.toggle();
				setTimeout(terminal.cursorBlink, terminal.settings.cursorBlinkRate);
			},
			
			/**
			 * Returnes true if the cursor should not blink
			 * @returns		boolean
			 */
			isCursorBlinkDisabled		:		function() {
				if (terminal.lastCursorPositionChange + terminal.settings.cursorBlinkTimeout > (new Date()).getTime()) return true;
				
				return terminal.disableCursorBlink;
			}
	};
	
	/**
	 * Terminal namespace
	 */
	$.fn.terminal = function(method) {
		if (terminal[method])
			// fire methods
			return terminal[method].apply(this, Array.prototype.slice.call( arguments, 1 ));
		
		else if (typeof method === 'object' || ! method) {
			// fire init method
			return terminal.init.apply(this, arguments);
		}
	}
})( jQuery );