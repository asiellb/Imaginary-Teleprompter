/*
	Teleprompter
	Copyright (C) 2015 Imaginary Films LLC and contributors
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

"use strict";

// IMPORT MAIN PROGRAM MODULES
if (require('electron-squirrel-startup')) return;
const { electron,
	app, // Module to control application's life.
	BrowserWindow, // Module to create native browser window.
	Menu, // The menu class is used to create native menus that can be used as application menus and context menus.
	ipcMain, // The ipcMain module, when used in the main process, handles asynchronous and synchronous messages sent from a renderer process (web page).
	shell, // Module that provides functions related to desktop integration.
	globalShortcut // Module can register/unregister a global keyboard shortcut with the operating system so that you can customize the operations for various shortcuts.
	// Keep a global reference of the window object, if you don't, the window will be closed automatically when the JavaScript object is garbage collected.
} = require('electron');

// This should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
  // squirrel event handled and app will exit in 1000ms, so don't do anything else
  return;
}

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false;
  }

  const ChildProcess = require('child_process');
  const path = require('path');

  const appFolder = path.resolve(process.execPath, '..');
  const rootAtomFolder = path.resolve(appFolder, '..');
  const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
  const exeName = path.basename(process.execPath);

  const spawn = function(command, args) {
    let spawnedProcess, error;

    try {
      spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
    } catch (error) {}

    return spawnedProcess;
  };

  const spawnUpdate = function(args) {
    return spawn(updateDotExe, args);
  };

  const squirrelEvent = process.argv[1];
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Optionally do things such as:
      // - Add your .exe to the PATH
      // - Write to the registry for things like file associations and
      //   explorer context menus

      // Install desktop and start menu shortcuts
      spawnUpdate(['--createShortcut', exeName]);

      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-uninstall':
      // Undo anything you did in the --squirrel-install and
      // --squirrel-updated handlers

      // Remove desktop and start menu shortcuts
      spawnUpdate(['--removeShortcut', exeName]);

      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-obsolete':
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated

      app.quit();
      return true;
  }
};

// Set Global window variable.
let mainWindow = null;

// This method will be called when Electron has finished initialization and is ready to create browser windows.
app.on('ready', () => {
	// Create the browser window.
	mainWindow = new BrowserWindow({width: 1280, height: 800, javascript: true, title: 'Teleprompter', useContentSize: true, nodeIntegration: true, icon: __dirname + '/icon.ico'});

  	if (process.platform === 'darwin') {
		// Create our menu entries so that we can use MAC shortcuts
		Menu.setApplicationMenu(Menu.buildFromTemplate([
			{
				label: 'Edit',
				submenu: [
					{ role: 'undo' },
					{ role: 'redo' },
					{ type: 'separator' },
					{ role: 'cut' },
					{ role: 'copy' },
					{ role: 'paste' }, 
					{ role: 'delete' },
					{ role: 'selectall' }
				]
			}
		]));
	}else{
		// Disables menu in systems where it can be disabled and doesn't need it'.
    	Menu.setApplicationMenu(null);
	}


	// and load the index.html of app.
	mainWindow.loadURL('file://' + __dirname + '/index.html');
	let contents = mainWindow.webContents;

	// IPC interaction

	// Debug tools
	contents.on('devtools-opened', () => {
	    contents.executeJavaScript('enterDebug()');
	});
	contents.on('devtools-closed', () => {
	    contents.executeJavaScript('exitDebug()');
	});

	// Get computer IPs for remote control
    function getIP() {
	    var os = require('os');
	    var nets = os.networkInterfaces();
	    for ( var a in nets) {
	      var ifaces = nets[a];
	      for ( var o in ifaces) {
	        if (ifaces[o].family == "IPv4" && !ifaces[o].internal) {
	          return ifaces[o].address;
	        }
	      }
	    }
	    return null;
	}

	// Remote control server
	function runSocket(event) {
	    var ip = getIP();
	    if(ip){
	      var app2 = require('express')();
	      var http = require('http').Server(app2);
	      var bonjour = require('bonjour')();
	      var io = require('socket.io')(http);

	      io.sockets.on('connection', function (socket) {
	        socket.on('command',function(res){
	            if(res.hasOwnProperty('key') > 0){
	              event.sender.send('asynchronous-reply',{'option':'command','data':res});
	            }
	        });
	        socket.on('disconnect', function () {});
	      });

	      http.listen(3000, function(){
	        event.sender.send('asynchronous-reply',{'option':'qr','data':ip});
	        //console.log('http://' + ip + ':3000/');
	      });

	      bonjour.publish({ name: 'Teleprompter', type: 'http', port: 3000 });
	      bonjour.find({ type: 'http' }, function (service) {
	        //console.log('Found an HTTP server:'+ service);
	        event.sender.send('asynchronous-reply',{'option':'qr','data':service.host});
	      });
	    }else{
	      setTimeout(function(){
	        runSocket(event);
	      }, 1000);
	    }
	}

	// Send a message to the renderer process...
	ipcMain.on('asynchronous-message', (event, arg) => {
		if (arg === "network")
	  		runSocket(event);
		else if (arg === "prepareLinks")
	  		event.sender.send('asynchronous-reply',{'option':'prepareLinks'});;
	});

	// Close Window
	mainWindow.on('closed', () =>{
        // Dereference the windows object, usually you would store  windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
		mainWindow = null;
	});
});
